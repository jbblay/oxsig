-- Follow-on to 063: appeal an audited profile decision without revealing reports.
ALTER TABLE mentorship_reviews ADD COLUMN management_event_id UUID REFERENCES mentorship_evidence_events(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX mentorship_one_appeal_management ON mentorship_reviews(owner_id,management_event_id) WHERE kind='appeal';
