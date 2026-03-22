-- Profiles: extends auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  stripe_customer_id text,
  toss_customer_id text,
  paddle_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Drills
create table public.drills (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Drill',
  description text default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drills enable row level security;

create policy "Users can CRUD own drills"
  on public.drills for all using (auth.uid() = user_id);

-- Sessions
create table public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New Session',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Users can CRUD own sessions"
  on public.sessions for all using (auth.uid() = user_id);

-- Subscriptions
create table public.subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'toss', 'paddle')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscriptions"
  on public.subscriptions for select using (auth.uid() = user_id);

-- AI usage tracking
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  generation_count int not null default 0,
  unique (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

create policy "Users can read own AI usage"
  on public.ai_usage for select using (auth.uid() = user_id);

-- Indexes
create index idx_drills_user on public.drills(user_id);
create index idx_sessions_user on public.sessions(user_id);
create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_ai_usage_user_date on public.ai_usage(user_id, usage_date);
