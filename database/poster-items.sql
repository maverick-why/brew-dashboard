-- TV dynamic area content for /menu.html?screen=right
create table if not exists poster_items (
  id           uuid        primary key default gen_random_uuid(),
  type         text        not null
                           check (type in ('image', 'beer_recommend', 'info_card')),
  title        text,

  -- image
  image_url    text,

  -- beer_recommend: references Redis menu data by tap number
  tap_no       integer,

  -- info_card
  body         jsonb,
  qr_url       text,

  -- schedule and playback
  enabled      boolean     not null default true,
  sort_order   integer     not null default 0,
  duration_sec integer     not null default 10,
  starts_at    timestamptz,
  ends_at      timestamptz,

  -- background
  bg_type      text        not null default 'auto_blur'
                           check (bg_type in ('auto_blur', 'solid', 'gradient', 'theme')),
  bg_value     text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists poster_items_playback_idx
  on poster_items (enabled, sort_order, created_at);

create index if not exists poster_items_schedule_idx
  on poster_items (starts_at, ends_at);

create or replace function set_poster_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists poster_items_set_updated_at on poster_items;
create trigger poster_items_set_updated_at
before update on poster_items
for each row
execute function set_poster_items_updated_at();
