CREATE TABLE "InterviewReport" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "timeComplexity" TEXT NOT NULL,
    "spaceComplexity" TEXT NOT NULL,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewReport_submissionId_key" ON "InterviewReport"("submissionId");
CREATE UNIQUE INDEX "InterviewReport_shareToken_key" ON "InterviewReport"("shareToken");
CREATE INDEX "InterviewReport_createdAt_idx" ON "InterviewReport"("createdAt");

ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
