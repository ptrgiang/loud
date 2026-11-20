-- One row per install and UTC day. No IP address, no account detail: see apps/site/public/privacy.html.
CREATE TABLE reports (
  install TEXT NOT NULL,
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  agent INTEGER NOT NULL,
  update_checks INTEGER NOT NULL,
  platforms TEXT NOT NULL,
  collect TEXT NOT NULL,
  PRIMARY KEY (install, day)
);
CREATE INDEX reports_day ON reports (day);
