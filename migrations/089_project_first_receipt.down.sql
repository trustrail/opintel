DROP TRIGGER protect_first_receipt ON public.project;
DROP FUNCTION public.protect_first_receipt();
DROP TRIGGER remember_first_receipt ON public.query_run;
DROP FUNCTION public.remember_first_receipt();
ALTER TABLE public.project DROP COLUMN first_receipt_at;
