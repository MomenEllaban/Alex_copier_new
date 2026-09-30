-- Fix CopierTest testDate timezone offset
-- Same issue as WorkshopPartMovement: testDate was stored 3 hours ahead
-- of actual Egypt time due to double timezone conversion.
-- Subtract 3 hours from all testDate fields that are not null.

UPDATE "CopierTest"
SET "testDate" = "testDate" - INTERVAL '3 hours'
WHERE "testDate" IS NOT NULL;
