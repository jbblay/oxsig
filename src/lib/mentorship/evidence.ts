import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import type { z } from 'zod';
import { getPool, transaction } from '@/lib/db/pool';
import { loadProvedSkillTranscript } from '@/lib/learning/transcript-server';
import { CURATED_LEARNING_PATHS } from '@/lib/learning/curated-paths';
import { MentorshipError, type Queryable } from './server';
import { evidenceCommandSchema, reviewCommandSchema, forgePassing, promotionRequirements } from './evidence-policy';

const fail = (message: string, status = 409): never => { throw new MentorshipError(message, 'EVIDENCE_POLICY', status); };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function evidenceEvent(db: Queryable, owner: string, actor: string, resource: string, action: string, detail: object = {}) {
  await db.query(`INSERT INTO mentorship_evidence_events(owner_id,actor_id,resource_id,action,detail) VALUES($1,$2,$3,$4,$5::jsonb)`, [owner,actor,resource,action,JSON.stringify(detail)]);
}
async function participant(db: Queryable, owner: string, id: string, attended = false) {
  const {rows} = await db.query(`SELECT * FROM mentorship_sessions WHERE id=$1 AND (learner_id=$2 OR mentor_id=$2) FOR UPDATE`, [id,owner]);
  const row = rows[0];
  if (!row) return fail('Session not found.',404);
  if (attended) {
    if(row.status!=='completed' || !row.mentor_id) return fail('Only completed, attended sessions support feedback.');
    const attendance = await db.query(`SELECT owner_id FROM mentorship_attendance WHERE session_id=$1 AND owner_id=ANY($2::uuid[])`,[id,[row.learner_id,row.mentor_id]]);
    if(attendance.rows.length!==2) return fail('Both participants must have joined the Rescue Room.');
  }
  return row;
}
export async function evidenceState(owner: string) {
  const db=getPool();
  const [forge,outcomes,reviews,shares,events,applications,sessions]=await Promise.all([
    db.query(`SELECT id,application_id,template_version,rubric_version,explanation,questions,reasoning,status,scores,reason,created_at,decided_at FROM mentor_forge_attempts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[owner]),
    db.query(`SELECT * FROM mentorship_help_outcomes WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[owner]),
    db.query(`SELECT id,kind,session_id,forge_id,parent_id,detail,status,reason,created_at,decided_at FROM mentorship_reviews WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[owner]),
    db.query(`SELECT id,expires_at,revoked_at,created_at FROM skills_passport_shares WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[owner]),
    db.query(`SELECT id,resource_id,action,created_at FROM mentorship_evidence_events WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[owner]),
    db.query(`SELECT id,headline,status FROM mentor_applications WHERE applicant_id=$1 ORDER BY created_at DESC LIMIT 50`,[owner]),
    db.query(`SELECT id,topic,status FROM mentorship_sessions WHERE learner_id=$1 OR mentor_id=$1 ORDER BY starts_at DESC LIMIT 100`,[owner]),
  ]);
  return {applications:applications.rows,sessions:sessions.rows,forge:forge.rows,outcomes:outcomes.rows,reviews:reviews.rows,shares:shares.rows,events:events.rows};
}
export async function commandEvidence(owner: string, command: z.infer<typeof evidenceCommandSchema>) {
  return transaction(async db => {
    // Serializes submissions and appeals across tabs, as well as promotion checks.
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`mentor-evidence:${owner}`]);
    let id: string;
    if(command.action==='forge') {
      const app=await db.query(`SELECT id FROM mentor_applications WHERE id=$1 AND applicant_id=$2 AND status NOT IN ('withdrawn','rejected') FOR UPDATE`,[command.applicationId,owner]);
      if(!app.rows.length) return fail('Application not found or closed.',404);
      const previous=await db.query(`SELECT status,created_at FROM mentor_forge_attempts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1`,[owner]);
      const last=previous.rows[0];
      if(last && (['submitted','accepted'].includes(last.status) || Date.now()-new Date(last.created_at).getTime()<86400000)) return fail('Resubmit after review and a 24-hour reflection period. Accepted auditions cannot be farmed.');
      const result=await db.query(`INSERT INTO mentor_forge_attempts(owner_id,application_id,template_version,rubric_version,explanation,questions,reasoning) VALUES($1,$2,'docker-ports-v1','teaching-v1',$3,$4,$5) RETURNING id`,[owner,command.applicationId,command.explanation,command.questions,command.reasoning]);
      id=result.rows[0].id;
    } else if(command.action==='outcome') {
      const session=await participant(db,owner,command.sessionId,true);
      const role=session.learner_id===owner?'learner':'mentor';
      const result=await db.query(`INSERT INTO mentorship_help_outcomes(session_id,owner_id,role,outcome,rating,reflection) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(session_id,role) DO UPDATE SET outcome=EXCLUDED.outcome,rating=EXCLUDED.rating,reflection=EXCLUDED.reflection,updated_at=NOW()
        WHERE mentorship_help_outcomes.owner_id=$2 AND mentorship_help_outcomes.created_at>NOW()-INTERVAL '24 hours'
        AND NOT EXISTS(SELECT 1 FROM mentorship_reviews WHERE session_id=$1 AND kind='quality') RETURNING id`,[command.sessionId,owner,role,command.outcome,command.rating,command.reflection]);
      if(!result.rows.length) return fail('Feedback is locked after 24 hours or submission for quality review.');
      id=result.rows[0].id;
    } else if(command.action==='report' || command.action==='quality') {
      const session=await participant(db,owner,command.sessionId,command.action==='quality');
      if(command.action==='quality' && session.mentor_id!==owner) return fail('Only the session mentor may request quality review.',403);
      const subject=command.action==='quality'?owner:session.learner_id===owner?session.mentor_id:session.learner_id;
      if(!subject) return fail('The other account is no longer available.');
      const duplicate=await db.query(`SELECT id FROM mentorship_reviews WHERE session_id=$1 AND owner_id=$2 AND kind=$3`,[command.sessionId,owner,command.action]);
      if(duplicate.rows.length) return fail('This session already has your submission.');
      const result=await db.query(`INSERT INTO mentorship_reviews(owner_id,subject_id,kind,session_id,detail) VALUES($1,$2,$3,$4,$5) RETURNING id`,[owner,subject,command.action,command.sessionId,command.detail]);
      id=result.rows[0].id;
    } else if(command.action==='appeal') {
      if(Boolean(command.reviewId)===Boolean(command.forgeId)) return fail('Select exactly one decision to appeal.',400);
      let subject=owner;
      if(command.forgeId) {
        const r=await db.query(`SELECT id FROM mentor_forge_attempts WHERE id=$1 AND owner_id=$2 AND status IN ('rejected','changes_requested')`,[command.forgeId,owner]);
        if(!r.rows.length) return fail('Decision not found.',404);
      } else {
        const r=await db.query(`SELECT subject_id FROM mentorship_reviews WHERE id=$1 AND owner_id=$2 AND kind<>'appeal' AND status<>'pending'`,[command.reviewId,owner]);
        if(!r.rows.length) return fail('Decision not found.',404);
        subject=r.rows[0].subject_id;
      }
      const result=await db.query(`INSERT INTO mentorship_reviews(owner_id,subject_id,kind,parent_id,forge_id,detail) VALUES($1,$2,'appeal',$3,$4,$5) RETURNING id`,[owner,subject,command.reviewId??null,command.forgeId??null,command.detail]);
      id=result.rows[0].id;
    } else if(command.action==='share') {
      const token=randomBytes(32).toString('base64url');
      const result=await db.query(`INSERT INTO skills_passport_shares(owner_id,token_hash,consent_version,expires_at) VALUES($1,$2,'passport-v1',NOW()+make_interval(hours=>$3)) RETURNING id,expires_at`,[owner,hash(token),command.hours]);
      id=result.rows[0].id;
      await evidenceEvent(db,owner,owner,id,'passport.share');
      return {id,token,expiresAt:result.rows[0].expires_at};
    } else {
      const result=await db.query(`UPDATE skills_passport_shares SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1 AND owner_id=$2 RETURNING id`,[command.id,owner]);
      if(!result.rows.length) return fail('Share not found.',404);
      id=command.id;
    }
    await evidenceEvent(db,owner,owner,id,command.action);
    return {id};
  });
}
export async function reviewQueue() {
  const db=getPool();
  const [forge,reviews]=await Promise.all([db.query(`SELECT * FROM mentor_forge_attempts WHERE status='submitted' ORDER BY created_at LIMIT 100`),db.query(`SELECT * FROM mentorship_reviews WHERE status='pending' ORDER BY created_at LIMIT 100`)]);
  return {forge:forge.rows,reviews:reviews.rows};
}
export async function decideEvidence(admin: string, command: z.infer<typeof reviewCommandSchema>) {
  return transaction(async db => {
    const table=command.action==='forge'?'mentor_forge_attempts':'mentorship_reviews';
    const {rows}=await db.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[command.id]);
    const row=rows[0];
    if(!row) return fail('Review not found.',404);
    if(row.owner_id===admin || row.subject_id===admin) return fail('Conflict of interest: another administrator must review.',403);
    if(row.status!==(command.action==='forge'?'submitted':'pending')) return fail('This decision is already recorded.');
    // Session participants cannot moderate either side, including appeals.
    if(row.session_id) {
      const r=await db.query(`SELECT id FROM mentorship_sessions WHERE id=$1 AND (learner_id=$2 OR mentor_id=$2)`,[row.session_id,admin]);
      if(r.rows.length) return fail('Session participants cannot review this case.',403);
    }
    if(command.action==='forge') {
      if(command.decision==='accepted' && !forgePassing(command.scores)) return fail('Every rubric dimension requires at least 3/4 for acceptance.');
      await db.query(`UPDATE mentor_forge_attempts SET status=$2,scores=$3::jsonb,reason=$4,reviewer_id=$5,decided_at=NOW() WHERE id=$1`,[row.id,command.decision,JSON.stringify(command.scores),command.reason,admin]);
    } else {
      if(row.kind==='appeal') {
        const parentTable=row.forge_id?'mentor_forge_attempts':'mentorship_reviews';
        const parentId=row.forge_id||row.parent_id;
        const parent=await db.query(`SELECT * FROM ${parentTable} WHERE id=$1 FOR UPDATE`,[parentId]);
        const prior=parent.rows[0];
        if(!prior || prior.reviewer_id===admin || prior.owner_id===admin || prior.subject_id===admin) return fail('Appeals require an independent reviewer.',403);
        if(prior.session_id) {
          const conflict=await db.query(`SELECT id FROM mentorship_sessions WHERE id=$1 AND (learner_id=$2 OR mentor_id=$2)`,[prior.session_id,admin]);
          if(conflict.rows.length) return fail('Appeals require an independent reviewer.',403);
        }
        // An upheld appeal reopens review; it never grants a qualification.
        if(command.decision==='upheld') {
          await db.query(`UPDATE ${parentTable} SET status=$2,reason=NULL,reviewer_id=NULL,decided_at=NULL WHERE id=$1`,[parentId,row.forge_id?'submitted':'pending']);
          await evidenceEvent(db,prior.owner_id,admin,parentId,'appeal.reopened',{appealId:row.id});
        }
      }
      if(row.kind==='quality' && command.decision==='upheld') {
        await participant(db,row.owner_id,row.session_id,true);
        const feedback=await db.query(`SELECT role FROM mentorship_help_outcomes WHERE session_id=$1`,[row.session_id]);
        if(feedback.rows.length!==2) return fail('Independent feedback from both participants is required. Review the teaching quality and conduct, not the star rating.');
      }
      await db.query(`UPDATE mentorship_reviews SET status=$2,reason=$3,reviewer_id=$4,decided_at=NOW() WHERE id=$1`,[row.id,command.decision,command.reason,admin]);
    }
    await evidenceEvent(db,row.owner_id,admin,row.id,`${command.action}.${command.decision}`,{reason:command.reason, previousStatus:row.status,...(command.action==='forge'?{scores:command.scores}:{})});
    return {id:row.id};
  });
}
export async function assertPromotionEvidence(db: Queryable, mentor: string, tier: string) {
  const requirement=promotionRequirements(tier);
  const forge=await db.query(`SELECT id FROM mentor_forge_attempts WHERE owner_id=$1 AND status='accepted' AND decided_at>NOW()-INTERVAL '365 days'`,[mentor]);
  const quals=await db.query(`SELECT id FROM mentor_qualifications WHERE mentor_id=$1 AND status='active'`,[mentor]);
  const risk=await db.query(`SELECT id FROM mentorship_reviews WHERE subject_id=$1 AND kind='report' AND status<>'dismissed'`,[mentor]);
  const help=await db.query(`SELECT COUNT(DISTINCT s.id)::int AS sessions,COUNT(DISTINCT s.learner_id)::int AS learners FROM mentorship_reviews r JOIN mentorship_sessions s ON s.id=r.session_id WHERE r.subject_id=$1 AND r.kind='quality' AND r.status='upheld' AND s.status='completed' AND r.decided_at>NOW()-INTERVAL '365 days'`,[mentor]);
  if(!forge.rows.length || !quals.rows.length || risk.rows.length || help.rows[0].sessions<requirement.qualitySessions || help.rows[0].learners<requirement.distinctLearners) return fail('Promotion requires a current accepted audition, active qualifications, reviewed teaching quality with distinct learners, and no unresolved or upheld conduct reports.');
}
export async function passportSummary(owner: string) {
  const transcript=await loadProvedSkillTranscript(owner);
  const db=getPool();
  const [missions,quals]=await Promise.all([
    db.query(`SELECT mission_id,verified_at FROM academy_mission_progress WHERE owner_id=$1 AND verified_at IS NOT NULL ORDER BY mission_id`,[owner]),
    db.query(`SELECT q.specialization_id,q.status,q.granted_at,q.revoked_at,p.status AS profile_status FROM mentor_qualifications q JOIN mentor_profiles p ON p.user_id=q.mentor_id WHERE q.mentor_id=$1`,[owner]),
  ]);
  // Whitelisted projection only. Never export arbitrary evidence JSON, names, lab IDs or output.
  return {version:1,generatedAt:new Date().toISOString(),scope:'Recorded assessments and mission checks; not a professional certification.',capabilities:transcript.items.filter(i=>CURATED_LEARNING_PATHS.some(p=>p.id===i.pathId&&p.version===i.pathVersion&&p.capabilities.some(c=>c.id===i.capabilityId))).map(i=>({capabilityId:i.capabilityId,pathId:i.pathId,pathVersion:i.pathVersion,assessmentScope:i.proofMethod,demonstratedAt:i.demonstratedAt,status:i.enrollmentStatus==='abandoned'?'withdrawn':Date.now()-Date.parse(i.demonstratedAt)>31536000000?'expired':'current'})),missions:missions.rows.map(r=>({missionId:r.mission_id,version:1,verifiedAt:r.verified_at,status:Date.now()-new Date(r.verified_at).getTime()>31536000000?'expired':'current'})),qualifications:quals.rows.map(r=>({specializationId:r.specialization_id,version:1,grantedAt:r.granted_at,status:r.status==='active'&&r.profile_status==='active'?'current':'withdrawn'}))};
}
export async function publicPassport(token: string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail('Passport unavailable.',404);
  const {rows}=await getPool().query(`SELECT owner_id FROM skills_passport_shares WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()`,[hash(token)]);
  if(!rows.length) return fail('Passport unavailable.',404);
  return passportSummary(rows[0].owner_id);
}
