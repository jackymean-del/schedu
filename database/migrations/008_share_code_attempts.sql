-- 008_share_code_attempts.sql
--
-- A one-time share code is 6 digits inside a 10-minute window — about 10^6
-- possibilities, which a script exhausts in minutes. The window was never the
-- defence; the number of guesses is. Count them per code so VerifyShareCode can
-- stop at a handful and force the caller to prove control of the mailbox again.

ALTER TABLE share_access_codes
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
