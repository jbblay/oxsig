'use client';

import * as React from 'react';
import Link from 'next/link';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Checkout = { id:string; product_type:string; product_id:string; price_cents:number; created_at:string };
type Credit = { id:string; delta:number; reason:string; created_at:string };
type Earning = { id:string; session_id:string; amount_cents:number; state:string };
type State = {
  enabled:boolean;
  demoOnly?:boolean;
  message?:string;
  disclaimer?:string;
  subscription?:{plan_id:string;state:string;active:boolean;ends_at:string}|null;
  learningCredits?:number;
  mentorEarningsCents?:number;
  checkouts?:Checkout[];
  creditHistory?:Credit[];
  earningHistory?:Earning[];
};
type Session = { id:string; role:'learner'|'mentor'; status:string; topic:string };

const products = [
  { type:'plan', id:'plus', name:'Academy Plus', price:8, extra:'30-day simulated subscription. No real entitlements.' },
  { type:'plan', id:'professional', name:'Professional', price:18, extra:'30-day simulated subscription. No real entitlements.' },
  { type:'credit_pack', id:'starter', name:'Starter credits', price:2, extra:'100 simulated, nontransferable learning credits.' },
  { type:'credit_pack', id:'builder', name:'Builder credits', price:5, extra:'300 simulated, nontransferable learning credits.' },
] as const;

export default function SandboxCommerce() {
  const [state,setState] = React.useState<State|null>(null);
  const [sessions,setSessions] = React.useState<Session[]>([]);
  const [sessionId,setSessionId] = React.useState('');
  const [redeemAmount,setRedeemAmount] = React.useState(25);
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [notice,setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    const response = await fetch('/api/academy/sandbox-commerce', { cache:'no-store' });
    const body = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body.error || 'Sandbox commerce is unavailable.');
    setState(body as State);
    if(body.enabled) {
      const bookings = await fetch('/api/mentorship/sessions', {cache:'no-store'});
      if(bookings.ok) {
        const result = await bookings.json() as {sessions:Session[]};
        setSessions(result.sessions.filter(item=>item.role==='mentor' && item.status==='completed'));
      }
    }
  }, []);

  React.useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);

  async function perform(input:Record<string,unknown>) {
    setBusy(true);setNotice('');setError('');
    try {
      const response = await fetch('/api/academy/sandbox-commerce',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-csrf-token':await getCsrfToken()},
        body:JSON.stringify(input),
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error || 'Sandbox action failed.');
      setState(body as State);
      setNotice('Simulation recorded. No real money moved and no paid entitlement was granted.');
    }catch(e){setError(e instanceof Error?e.message:'Sandbox action failed.');}
    finally{setBusy(false);}
  }
  const card='rounded-xl border bg-card p-4 space-y-3';
  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OXSIG Academy · Commerce laboratory</div>
      <h1 className="text-2xl font-bold sm:text-3xl">Sandbox Subscriptions & Learning Credits</h1>
      <p className="text-sm text-muted-foreground">A deliberately simulated financial workflow. This page does not accept payments, create payout obligations, or provide real subscription upgrades.</p>
    </header>
    <div role="note" className="rounded-xl border border-amber-600/30 bg-amber-500/5 p-4 text-sm">
      <strong>Simulation only.</strong> Real payments and mentor withdrawals are disabled. Your existing mentorship bookings remain free. Demo credits cannot purchase actual mentoring or labs.
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-primary/30 p-3 text-sm">{notice}</p>}
    {!state && !error && <p aria-live="polite">Loading sandbox records…</p>}
    {state && !state.enabled && <section className={card}><h2 className="text-lg font-semibold">Sandbox currently disabled</h2><p className="text-sm text-muted-foreground">{state.message || 'Sandbox commerce is not enabled.'}</p><p className="text-xs">An administrator may enable the demonstration with OXSIG_SANDBOX_COMMERCE_ENABLED=true in a non-production environment after migration 066 has been applied.</p><Link href="/academy/mentors" className="text-sm underline">Browse free mentor sessions</Link></section>}
    {state?.enabled && <>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className={card}><div className="text-xs text-muted-foreground">Demo subscription</div><div className="font-semibold">{state.subscription?.active ? state.subscription.plan_id : 'No active demo plan'}</div><div className="text-xs text-muted-foreground">{state.subscription?.ends_at ? 'Ends '+new Date(state.subscription.ends_at).toLocaleDateString() : 'No paid entitlement granted'}</div></div>
        <div className={card}><div className="text-xs text-muted-foreground">Demo learning credits</div><div className="text-2xl font-bold">{state.learningCredits ?? 0}</div><div className="text-xs">No cash value or external redemption</div></div>
        <div className={card}><div className="text-xs text-muted-foreground">Hypothetical mentor earnings</div><div className="text-2xl font-bold">${((state.mentorEarningsCents ?? 0)/100).toFixed(2)}</div><div className="text-xs">Nonwithdrawable, not owed</div></div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Try simulated checkout</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {products.map(item=><div key={item.id} className={card}>
            <div className="flex items-center justify-between"><strong>{item.name}</strong><span className="text-sm">${item.price.toFixed(2)} demo</span></div>
            <p className="text-xs text-muted-foreground">{item.extra}</p>
            <button className="w-full rounded-lg border p-2 text-sm font-semibold hover:bg-muted disabled:opacity-50" disabled={busy} onClick={()=>void perform({action:'checkout',productType:item.type,productId:item.id,requestId:crypto.randomUUID()})}>Simulate checkout</button>
          </div>)}
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className={card}>
          <h2 className="font-semibold">Demo credit redemption</h2>
          <p className="text-xs text-muted-foreground">Practice spending credits in the simulated ledger. Nothing in OXSIG is purchased.</p>
          <label className="block text-sm">Demo credits to redeem
            <input type="number" className="mt-1 w-full rounded-lg border bg-background p-2" min={1} max={300} value={redeemAmount} onChange={e=>setRedeemAmount(Number(e.target.value))}/>
          </label>
          <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" disabled={busy||!Number.isInteger(redeemAmount)||redeemAmount<1||redeemAmount>300} onClick={()=>void perform({action:'redeem',amount:redeemAmount,requestId:crypto.randomUUID()})}>Simulate redemption</button>
        </div>
        <div className={card}>
          <h2 className="font-semibold">Demo mentor earnings</h2>
          <p className="text-xs text-muted-foreground">Only a completed session with verified attendance by both participants can create a one-time hypothetical $2 entry.</p>
          <label className="block text-sm">My completed mentorship session
            <select className="mt-1 w-full rounded-lg border bg-background p-2" value={sessionId} onChange={e=>setSessionId(e.target.value)}>
              <option value="">Select a session</option>
              {sessions.map(item=><option key={item.id} value={item.id}>{item.topic}</option>)}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" disabled={!sessionId||busy} onClick={()=>void perform({action:'record_mentoring',sessionId})}>Simulate mentor earnings</button>
          {!sessions.length&&<p className="text-xs text-muted-foreground">No completed mentor sessions are available for demonstration.</p>}
        </div>
      </section>
      <section className={card}><h2 className="font-semibold">Transaction history · fictional</h2><div className="max-h-64 space-y-2 overflow-y-auto text-xs">
        {!state.checkouts?.length && !state.creditHistory?.length && !state.earningHistory?.length && <p>No simulated activity recorded.</p>}
        {state.checkouts?.map(item=><div className="border-b py-2" key={item.id}>Simulated {item.product_type.replace('_',' ')} · {item.product_id} · ${(item.price_cents/100).toFixed(2)} · {new Date(item.created_at).toLocaleString()}</div>)}
        {state.creditHistory?.map(item=><div className="border-b py-2" key={item.id}>Credits {item.delta>0?'+':''}{item.delta} · {item.reason} · {new Date(item.created_at).toLocaleString()}</div>)}
        {state.earningHistory?.map(item=><div className="border-b py-2" key={item.id}>Hypothetical mentor earnings ${(item.amount_cents/100).toFixed(2)} · not withdrawable</div>)}
      </div></section>
    </>}
  </main>;
}
