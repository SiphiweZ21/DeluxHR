-- DeluxHR Early Pay transfer fees
-- Standard transfer: R5
-- Instant transfer: R20
-- No percentage-based transaction fee.

ALTER TABLE "EarlyPayPolicy"
ALTER COLUMN "serviceFee" SET DEFAULT 0;

ALTER TABLE "EarlyPayPolicy"
ALTER COLUMN "standardTransferFee" SET DEFAULT 5;

ALTER TABLE "EarlyPayPolicy"
ALTER COLUMN "instantTransferFee" SET DEFAULT 20;

UPDATE "EarlyPayPolicy"
SET
  "serviceFee" = 0,
  "standardTransferFee" = 5,
  "instantTransferFee" = 20;
