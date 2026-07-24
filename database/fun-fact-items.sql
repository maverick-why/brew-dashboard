-- "本店趣味数据榜" content for /menu.html?screen=right (mirrors the poster zone on ?screen=left)
create table if not exists fun_fact_items (
  id            uuid        primary key default gen_random_uuid(),
  category      text        not null
                            check (category in ('sales', 'member', 'keg', 'staff')),
  title         text        not null,
  value         text        not null,
  caption       text,
  internal_note text,

  enabled       boolean     not null default true,
  sort_order    integer     not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists fun_fact_items_display_idx
  on fun_fact_items (enabled, sort_order, created_at);

create or replace function set_fun_fact_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists fun_fact_items_set_updated_at on fun_fact_items;
create trigger fun_fact_items_set_updated_at
before update on fun_fact_items
for each row
execute function set_fun_fact_items_updated_at();
