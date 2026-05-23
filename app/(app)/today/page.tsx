import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <PagePlaceholder
      title="Today"
      description="Today's meal suggestion and the reason behind it."
      note="Today's generation and accept / reject / suggest-another arrive in Phase 5."
    />
  );
}
