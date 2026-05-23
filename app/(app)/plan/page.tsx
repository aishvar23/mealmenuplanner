import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Plan" };

export default function PlanPage() {
  return (
    <PagePlaceholder
      title="Weekly plan"
      description="Your week of meals across the slots you plan."
      note="Weekly generation, replace, lock, and eating-out arrive in Phase 5."
    />
  );
}
