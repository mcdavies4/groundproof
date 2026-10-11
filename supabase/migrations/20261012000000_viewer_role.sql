-- Family viewers, part 1: a third member role. Kept in its own migration because a new
-- enum value can't be used in the same transaction that adds it.
alter type public.member_role add value if not exists 'viewer';
