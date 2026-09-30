-- Fix WorkshopPartMovement date timezone offset
-- The date field was stored 3 hours ahead of actual Egypt time due to
-- double timezone conversion (local -> UTC -> local again).
-- Subtract 3 hours from all date fields to correct them.
-- receivedAt fields are already correct and should not be modified.

UPDATE "WorkshopPartMovement"
SET "date" = "date" - INTERVAL '3 hours'
WHERE "deletedAt" IS NULL;
