CREATE TABLE public.rfqs (
  id text PRIMARY KEY,
  title text NOT NULL,
  product_category text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  line_items integer NOT NULL DEFAULT 0,
  submission_deadline text,
  doc jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.rfqs TO anon, authenticated;
GRANT ALL ON public.rfqs TO service_role;

ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rfqs" ON public.rfqs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create rfqs" ON public.rfqs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update rfqs" ON public.rfqs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_rfqs_updated_at BEFORE UPDATE ON public.rfqs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();