-- Photos and videos on chat messages and dispute messages
ALTER TABLE "Message" ADD COLUMN "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DisputeMessage" ADD COLUMN "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
