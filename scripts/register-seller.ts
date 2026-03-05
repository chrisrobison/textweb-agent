// scripts/register-seller.ts
import { Payments, EnvironmentName } from "@nevermined-io/payments";
import type { AgentMetadata, AgentAPIAttributes, PlanMetadata } from "@nevermined-io/payments";

const payments = Payments.getInstance({
  nvmApiKey: process.env.NVM_API_KEY!,
  environment: (process.env.NVM_ENVIRONMENT || "sandbox") as EnvironmentName,
});

async function main() {
  const creditsConfig = payments.plans.getFixedCreditsConfig(1000n, 1n);
  const priceConfig = payments.plans.getFiatPriceConfig(
    1000n, // $10.00 if cents
    payments.getAccountAddress() as `0x${string}`,
  );

  const result = await payments.agents.registerAgentAndPlan(
    {
      name: "TEXTWEB SUMMARIZE AGENT",
      description: "Paid TextWeb render + summarize service",
    } as AgentMetadata,
    {
      endpoints: [
        { POST: "https://your-domain.com/v1/render" },
        { POST: "https://your-domain.com/v1/summarize" },
      ],
    } as AgentAPIAttributes,
    {
      name: "TextWeb Usage Plan",
      description: "Credit-metered webpage render/summarize calls",
    } as PlanMetadata,
    priceConfig,
    creditsConfig,
  );

  console.log("Agent ID:", result.agentId);
  console.log("Plan ID:", result.planId);
}

main().catch(console.error);
