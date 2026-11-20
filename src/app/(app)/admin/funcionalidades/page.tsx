import { listFeatures } from "@/server/admin/service";
import { FeaturesView } from "./features-view";

export default async function AdminFeaturesPage() {
  return <FeaturesView features={await listFeatures()} />;
}
