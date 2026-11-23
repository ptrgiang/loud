-- Hashed IPs that posted a usage report, per day: caps how much one address can add to the public totals.
CREATE TABLE posters (
  iphash TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (iphash, day)
);
