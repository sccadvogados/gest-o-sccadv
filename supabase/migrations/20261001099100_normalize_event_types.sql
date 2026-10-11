UPDATE public.eventos
SET tipo = CASE tipo
  WHEN 'reunião' THEN 'reuniao'
  WHEN 'audiência' THEN 'audiencia'
  ELSE tipo
END
WHERE tipo IN ('reunião', 'audiência');