CREATE TABLE public.analyst_chat_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id TEXT,
  session_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  payload JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX analyst_chat_log_created_at_idx ON public.analyst_chat_log (created_at DESC);
CREATE INDEX analyst_chat_log_session_idx ON public.analyst_chat_log (session_id, created_at);

GRANT SELECT, INSERT ON public.analyst_chat_log TO anon;
GRANT SELECT, INSERT ON public.analyst_chat_log TO authenticated;
GRANT ALL ON public.analyst_chat_log TO service_role;

ALTER TABLE public.analyst_chat_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read analyst chat log"
  ON public.analyst_chat_log FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can append to analyst chat log"
  ON public.analyst_chat_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);