-- KB search knows other words for the same thing (kb_search_synonyms, 5 Oct 2026).
-- "uniform" found nothing because the page says "Dress standard". kb_synonyms holds,
-- for a word someone might type, the words the pages actually use: a page counts as
-- having that word if it has the word itself or any of its others. Words are kept
-- lower case and singular, the way kb_search trims them ("clothes" is "clothe").
-- An "other" can be part of a word ("steril" finds sterilise and sterilization) or
-- two words ("fact find"). To add one later:
--   insert into public.kb_synonyms (word, also) values ('apron', array['dress']);
-- Not secret, so any signed-in person may read it; nobody writes it from the site.
create table if not exists public.kb_synonyms (
  word text primary key check (word = lower(word)),
  also text[] not null,
  added_at timestamptz not null default now());
alter table public.kb_synonyms enable row level security;
drop policy if exists kb_synonyms_read on public.kb_synonyms;
create policy kb_synonyms_read on public.kb_synonyms for select to authenticated using (true);
revoke all on public.kb_synonyms from public, anon;
grant select on public.kb_synonyms to authenticated;

insert into public.kb_synonyms (word, also) values
  -- Dress standard
  ('uniform', array['dress']), ('outfit', array['dress']), ('attire', array['dress']),
  ('clothe', array['dress']), ('damit', array['dress']),
  -- Salary, holidays and leave
  ('pay', array['salary', 'payment']), ('wage', array['salary']), ('sahod', array['salary']),
  ('sweldo', array['salary']), ('vacation', array['leave', 'holiday']), ('bakasyon', array['leave', 'holiday']),
  -- Redo and the guarantee
  ('complaint', array['redo', 'guarantee']), ('unhappy', array['redo', 'guarantee']),
  ('refund', array['redo', 'guarantee']), ('fix', array['redo']), ('ulit', array['redo']),
  -- Clients and booking
  ('customer', array['client']), ('appointment', array['booking']), ('schedule', array['booking', 'appointment']),
  ('greet', array['welcom']), ('greeting', array['welcom']),
  ('checkout', array['closing', 'reception']), ('bayad', array['payment', 'closing']),
  ('consultation', array['fact find', 'fact-find', 'hair plan']),
  -- Hair
  ('color', array['colour']), ('dye', array['colour']), ('kulay', array['colour']),
  ('haircut', array['cut']), ('gupit', array['cut']),
  ('blowdry', array['blow-dry', 'blow dry']), ('blowout', array['blow-dry', 'blow dry']),
  ('shampoo', array['backwash', 'wash']), ('hairwash', array['backwash']),
  ('rebond', array['smoothing', 'keratin']), ('smoothing', array['keratin']), ('keratin', array['smoothing']),
  -- Beauty
  ('lift', array['lvl']), ('masahe', array['massage']),
  ('kid', array['princess']), ('child', array['princess', 'kids']), ('children', array['princess', 'kids']),
  ('bata', array['princess', 'kids']),
  -- Hygiene
  ('sterilise', array['steril']), ('sterilize', array['steril']), ('sanitise', array['steril', 'clean']),
  ('sanitize', array['steril', 'clean']), ('disinfect', array['steril', 'clean']),
  -- Selling and training
  ('retail', array['product', 'home care', 'cross-sell']), ('sell', array['retail', 'cross-sell']),
  ('benta', array['retail']), ('course', array['training', 'development']),
  ('promotion', array['development programme', 'level']), ('exam', array['trade test', 'test']),
  ('assessment', array['trade test'])
on conflict (word) do nothing;

-- kb_search as in kb_search_questions.sql, with each typed word widened to its others.
create or replace function public.kb_search(q text)
returns table (slug text, section text, group_name text, title text, snippet text)
language sql stable security invoker set search_path = '' as $$
  with raw as (
    select w, w = any (array[
      -- English
      'a','an','the','and','or','but','if','of','to','in','on','at','for','with','from','by',
      'is','are','was','were','be','been','am','do','does','did','i','me','my','we','our','us',
      'you','your','it','its','this','that','these','those','what','whats','when','where',
      'which','who','why','how','can','could','should','would','will','may','might','must',
      'have','has','had','there','here','about','into','so','not','no','just','please','tell',
      'get','give','need','want','wants','know','any','some','there','they','them','their',
      'she','her','he','his','one','way','does','doing',
      -- Tagalog / Taglish
      'ang','ng','mga','sa','si','ni','na','ba','po','ko','mo','ka','ako','ikaw','siya','kami',
      'tayo','sila','nila','natin','namin','paano','pano','ano','saan','kailan','bakit','sino',
      'pag','kapag','kung','para','yung','yun','ito','iyan','iyon','dito','doon','may','meron',
      'wala','lang','din','rin','naman','nga','daw','raw','kasi','tapos','pwede','puwede',
      'dapat','gawin','mag','nag','beh'
    ]) as filler
    from regexp_split_to_table(lower(trim(q)), '[^a-z0-9]+') w
    where length(w) >= 2
  ),
  kept as (
    select distinct
      case when length(w) > 4 and w like '%ies' then left(w, -3) || 'y'
           when length(w) > 4 and (w like '%shes' or w like '%ches' or w like '%xes' or w like '%sses') then left(w, -2)
           when length(w) > 3 and w like '%s' and w not like '%ss' then left(w, -1)
           else w end as w
    from raw
    where not filler or not exists (select 1 from raw r where not r.filler)
  ),
  -- Each typed word (gid) with every spelling that counts for it: itself and its others.
  alts as (
    select k.w as gid, k.w as alt from kept k
    union
    select k.w, lower(a) from kept k join public.kb_synonyms s on s.word = k.w, unnest(s.also) a
  ),
  t as (select lower(trim(q)) as full_q, count(*) as n from kept),
  scored as (
    select p.slug, p.section, p.group_name, p.title, p.body_text, p.sort, t.full_q, t.n,
      (select count(distinct a.gid) from alts a where strpos(lower(p.title || ' ' || p.body_text), a.alt) > 0) as hits,
      (select count(distinct a.gid) from alts a where strpos(lower(p.title), a.alt) > 0) as title_hits,
      (select min(nullif(strpos(lower(p.body_text), a.alt), 0)) from alts a) as first_pos
    from public.kb_pages p, t
    where t.n > 0
  )
  select s.slug, s.section, s.group_name, s.title,
    substr(s.body_text, greatest(1, coalesce(s.first_pos, 1) - 60), 180)
  from scored s
  where length(trim(q)) >= 2
    and s.hits >= case when s.n <= 2 then s.n else ceil(s.n / 2.0) end
  order by
    (strpos(lower(s.title), s.full_q) > 0) desc,                                   -- whole phrase in the title
    (s.hits = s.n) desc,                                                           -- every word somewhere
    s.hits desc,                                                                   -- then the most words
    s.title_hits desc,                                                             -- words in the title
    (strpos(lower(s.body_text), s.full_q) > 0) desc,                               -- whole phrase in the text
    s.section, s.sort
  limit 20
$$;
revoke all on function public.kb_search(text) from public, anon;
grant execute on function public.kb_search(text) to authenticated;
