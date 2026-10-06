-- Kate, 6 Oct 2026: HR Forms & Waivers carry a "being confirmed" note, like kb_pages.note,
-- so the forms that still need Tara's, HR's or a lawyer's yes show "To check" on
-- /hub/forms and count on Team Home. From the open questions in CHANGES-hr-forms.md
-- (Downloads/hr-forms). One line per question; clear the note once it is answered.
alter table public.kb_files add column if not exists note text;

update public.kb_files set note = case code
  when 'HR-01' then 'Being confirmed: the leave types under UAE labour law. Sick, parental and Hajj leave are not listed. Is "Other" enough?'
  when 'HR-07' then 'Being confirmed: whether "labour card handed over" is still the right check, now that MOHRE issues the work permit electronically.' || chr(10) ||
                    'Being confirmed: whether the quarterly incentive is still paid this way.'
  else null end
where section = 'hr-forms' and code like 'HR-%';

update public.kb_files set note =
  'Being confirmed: a legal read of the waiver wording, which is still the 2020 wording.' || chr(10) ||
  'Being confirmed: which name goes on client forms, Tara Rose or the registered trading name.' ||
  case code
    when 'CL-02' then chr(10) || 'Being confirmed: the patch test wait (48 hours here, 24 hours on the Tinting Waiver).' ||
                      chr(10) || 'Being confirmed: the age limit (under 16 here, under 15 on the Keratin Waiver).'
    when 'CL-03' then chr(10) || 'Being confirmed: the patch test wait (24 hours here, 48 hours on the Skin Test form).'
    when 'CL-07' then chr(10) || 'Being confirmed: the age limit (under 15 here, under 16 on the Skin Test form).'
    when 'CL-09' then chr(10) || 'Being confirmed: whether LVL is offered to under-18s with a parent or guardian''s consent.'
    when 'CL-11' then chr(10) || 'Being confirmed: whether trade test models can be under 18. If yes, it needs a parent or guardian line.'
    when 'CL-12' then chr(10) || 'Being confirmed: an Arabic speaker''s read of the Arabic salon and branch names.'
    else '' end
where section = 'hr-forms' and code like 'CL-%';
