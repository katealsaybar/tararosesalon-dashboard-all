-- Create service_data table for yearly service performance uploads.
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS service_data (
  id            bigserial PRIMARY KEY,
  year          integer NOT NULL,
  branch        text NOT NULL,
  purchase_date date NOT NULL,
  client_name   text,
  service_name  text,
  category      text,
  amount        numeric(10,2) DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_data_year_branch ON service_data(year, branch);
CREATE INDEX IF NOT EXISTS idx_service_data_purchase_date ON service_data(purchase_date);
