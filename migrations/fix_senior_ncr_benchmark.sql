-- Kate, 8 Oct 2026: Senior Stylist's new client requests (ncr) benchmark had its two numbers swapped: the seed in
-- create_performance.sql lists (minimum, target) and had 16, 12, a minimum above its target. Now minimum 12, target 16,
-- the same ladder as Junior (4, 12) and Stylist (8, 16). Applied live; create_performance.sql is corrected for replays.
update perf_benchmarks set minimum = 12, target = 16 where level = 'Senior Stylist' and kpi = 'ncr' and minimum = 16 and target = 12;
