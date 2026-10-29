-- Staff campaign templates, step 3 (Kate, 29 Oct 2026): a bold title line at the top of each body and the footer "Tara Rose Salons" (as on
-- tr_staff_payslip_ready). The header slot is already the memo image, and WhatsApp allows one header only, so the title lives in the body.
-- Run live on 29 Oct 2026 while both templates were still unapproved. The Meta templates must be submitted with exactly these bodies and footer.
update public.staff_cmp_templates set footer = 'Tara Rose Salons', body = E'*Campaign heads-up*\n\n' || body
where key = 'heads_up' and not approved and body not like '*Campaign heads-up*%';
update public.staff_cmp_templates set footer = 'Tara Rose Salons', body = E'*Campaign update*\n\n' || body
where key = 'live' and not approved and body not like '*Campaign update*%';
