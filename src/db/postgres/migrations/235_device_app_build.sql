-- 4298 (plate NEW-7): which app build people keep using. The app sends its
-- build code as X-App-Build; the newest one a device was seen with is kept
-- beside it. NULL until the app sends the header.
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS app_build TEXT;
CREATE INDEX IF NOT EXISTS idx_device_fp_build_seen ON device_fingerprints (app_build, last_seen);
