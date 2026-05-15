-- 酒厂
CREATE TABLE breweries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 成员
CREATE TABLE brewery_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id   uuid REFERENCES breweries NOT NULL,
  user_id      uuid REFERENCES auth.users NOT NULL,
  role         text CHECK (role IN ('owner','brewer')) NOT NULL,
  display_name text NOT NULL,
  status       text CHECK (status IN ('active','pending')) DEFAULT 'pending',
  created_at   timestamptz DEFAULT now(),
  UNIQUE(brewery_id, user_id)
);

-- 批次
CREATE TABLE batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id  uuid REFERENCES breweries NOT NULL,
  tank        text NOT NULL,
  beer        text NOT NULL,
  batch_no    text,
  color       text NOT NULL DEFAULT '#1D9E75',
  og          text,
  yeast       text,
  notes       text,
  plan        jsonb NOT NULL,
  created_at  timestamptz DEFAULT now(),
  archived_at timestamptz
);

-- 操作日志
CREATE TABLE batch_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id uuid REFERENCES breweries NOT NULL,
  batch_id   uuid REFERENCES batches NOT NULL,
  step_key   text NOT NULL,
  operator   text,
  ts         timestamptz NOT NULL DEFAULT now(),
  temp       text,
  brix       text,
  ph         text,
  note       text,
  is_defer   boolean DEFAULT false
);

-- batch_logs 唯一索引（非 defer 日志每个节点只能有一条）
CREATE UNIQUE INDEX batch_logs_unique_step
  ON batch_logs(batch_id, step_key)
  WHERE is_defer = false;

-- RLS 辅助函数
CREATE FUNCTION my_brewery_id() RETURNS uuid AS $$
  SELECT brewery_id FROM brewery_members
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE FUNCTION my_role() RETURNS text AS $$
  SELECT role FROM brewery_members
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- RLS
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own brewery" ON breweries
  FOR SELECT USING (id = my_brewery_id());

ALTER TABLE brewery_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read members" ON brewery_members
  FOR SELECT USING (brewery_id = my_brewery_id());
CREATE POLICY "owner manage" ON brewery_members
  FOR ALL USING (brewery_id = my_brewery_id() AND my_role() = 'owner');

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant" ON batches FOR ALL USING (brewery_id = my_brewery_id());

ALTER TABLE batch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant" ON batch_logs FOR ALL USING (brewery_id = my_brewery_id());

-- 邀请激活 trigger
CREATE FUNCTION handle_user_confirmed() RETURNS trigger AS $$
BEGIN
  UPDATE brewery_members SET status = 'active'
  WHERE user_id = NEW.id AND status = 'pending';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_user_confirmed();
