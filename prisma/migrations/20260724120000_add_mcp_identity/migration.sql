-- CreateTable
CREATE TABLE "mcp_identities" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_identities_issuer_subject_key" ON "mcp_identities"("issuer", "subject");

-- CreateIndex
CREATE INDEX "mcp_identities_userId_idx" ON "mcp_identities"("userId");

-- AddForeignKey
ALTER TABLE "mcp_identities" ADD CONSTRAINT "mcp_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
