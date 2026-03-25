-- ══════════════════════════════════════════════
-- HOMEFOLK DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── USERS (extends Supabase auth.users) ──
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'tenant' check (role in ('landlord','tenant','admin')),
  instagram text,
  linkedin text,
  airbnb text,
  star_sign text,
  bio text,
  stripe_customer_id text,
  tenant_subscription_id text,
  tenant_subscription_status text,
  created_at timestamptz default now()
);

-- ── LISTINGS ──
create table public.listings (
  id uuid default uuid_generate_v4() primary key,
  landlord_id uuid references public.users(id) on delete cascade not null,
  type text not null check (type in ('flatshare','rental','sublet')),
  title text not null,
  location text not null,
  price integer, -- in pence
  beds text,
  baths text,
  bills_included boolean default false,
  furnished text,
  pet_friendly text,
  description text,
  motto text,
  available_date date,
  sublet_until date,
  photos text[] default '{}',
  star_signs text[] default '{}',
  music_vibes text[] default '{}',
  spotify_url text,
  instagram text,
  linkedin text,
  airbnb text,
  status text not null default 'pending' check (status in ('pending','active','let','expired')),
  stripe_payment_intent_id text,
  promo_code_used text,
  goes_live_at timestamptz,
  expires_at timestamptz,
  newsletter_included boolean default true,
  created_at timestamptz default now()
);

-- ── ENQUIRIES ──
create table public.enquiries (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.users(id) on delete cascade not null,
  landlord_id uuid references public.users(id) on delete cascade not null,
  listing_id uuid references public.listings(id) on delete cascade not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- ── SUBSCRIBERS ──
create table public.subscribers (
  id uuid default uuid_generate_v4() primary key,
  email text not null unique,
  name text,
  source text default 'website',
  active boolean default true,
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz
);

-- ── PROMO CODES ──
create table public.promo_codes (
  id uuid default uuid_generate_v4() primary key,
  code text not null unique,
  discount_type text not null default 'free-flatshare' check (discount_type in ('free-flatshare','free-rental','free-sublet','free-any')),
  description text,
  uses_remaining integer,
  max_uses integer,
  uses_count integer default 0,
  expiry date,
  note text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ── NEWSLETTER ISSUES ──
create table public.newsletter_issues (
  id uuid default uuid_generate_v4() primary key,
  subject text not null,
  intro text,
  status text default 'draft' check (status in ('draft','scheduled','sent')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  sent_count integer,
  created_at timestamptz default now()
);

-- ══ SEED PROMO CODES ══
insert into public.promo_codes (code, discount_type, description, max_uses, note) values
  ('HOMEFOLK',  'free-flatshare', 'Free flatshare listing', null, 'Launch code'),
  ('WELCOME10', 'free-flatshare', 'Free flatshare listing', 100,  'Welcome campaign'),
  ('FIRSTLIST', 'free-flatshare', 'Free flatshare listing', 50,   'First listing promo'),
  ('FREEFLAT',  'free-flatshare', 'Free flatshare listing', null, 'General promo'),
  ('FRIEND',    'free-flatshare', 'Free flatshare listing', null, 'Friend referral');

-- ══ ROW LEVEL SECURITY ══

alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.enquiries enable row level security;
alter table public.subscribers enable row level security;
alter table public.promo_codes enable row level security;
alter table public.newsletter_issues enable row level security;

-- USERS policies
create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);
create policy "Service role full access to users" on public.users
  for all using (auth.role() = 'service_role');

-- LISTINGS policies
create policy "Anyone can view active listings" on public.listings
  for select using (status = 'active');
create policy "Landlords can manage own listings" on public.listings
  for all using (auth.uid() = landlord_id);
create policy "Service role full access to listings" on public.listings
  for all using (auth.role() = 'service_role');

-- ENQUIRIES policies
create policy "Tenants can create enquiries" on public.enquiries
  for insert with check (auth.uid() = tenant_id);
create policy "Tenants can view own enquiries" on public.enquiries
  for select using (auth.uid() = tenant_id);
create policy "Landlords can view enquiries on their listings" on public.enquiries
  for select using (auth.uid() = landlord_id);
create policy "Landlords can mark enquiries read" on public.enquiries
  for update using (auth.uid() = landlord_id);
create policy "Service role full access to enquiries" on public.enquiries
  for all using (auth.role() = 'service_role');

-- SUBSCRIBERS policies
create policy "Anyone can subscribe" on public.subscribers
  for insert with check (true);
create policy "Service role full access to subscribers" on public.subscribers
  for all using (auth.role() = 'service_role');

-- PROMO CODES policies
create policy "Anyone can read active promo codes" on public.promo_codes
  for select using (active = true);
create policy "Service role full access to promo codes" on public.promo_codes
  for all using (auth.role() = 'service_role');

-- NEWSLETTER policies
create policy "Service role full access to newsletter" on public.newsletter_issues
  for all using (auth.role() = 'service_role');

-- ══ FUNCTIONS ══

-- Auto-expire listings past their expiry date
create or replace function expire_old_listings()
returns void language sql as $$
  update public.listings
  set status = 'expired'
  where status = 'active'
    and expires_at < now();
$$;

-- Activate listings that are due to go live (Thursday debut)
create or replace function activate_thursday_listings()
returns void language sql as $$
  update public.listings
  set status = 'active'
  where status = 'pending'
    and goes_live_at <= now();
$$;

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'tenant')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- Messages table for two-way chat (run manually in Supabase SQL Editor)
-- CREATE TABLE public.messages (
--   id uuid default uuid_generate_v4() primary key,
--   enquiry_id uuid references public.enquiries(id) on delete cascade not null,
--   sender_id uuid references public.users(id) on delete cascade not null,
--   body text not null,
--   created_at timestamptz default now()
-- );
