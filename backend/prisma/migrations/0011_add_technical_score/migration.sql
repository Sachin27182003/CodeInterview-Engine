ALTER TABLE "Submission" ADD COLUMN "technicalScore" INTEGER;

UPDATE "Submission" SET "technicalScore" = "aiScore" WHERE "aiScore" IS NOT NULL;

UPDATE "Submission" SET "aiScore" = NULL WHERE "technicalScore" IS NOT NULL;
