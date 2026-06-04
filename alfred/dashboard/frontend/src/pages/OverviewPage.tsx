import { Header } from '../components/layout/Header';
import { ActionItems } from '../components/overview/ActionItems';
import { NexusOvernight } from '../components/overview/NexusOvernight';
import { ThroughputChart } from '../components/overview/ThroughputChart';
import { StatusDistribution } from '../components/overview/StatusDistribution';
import { PriorityBreakdown } from '../components/overview/PriorityBreakdown';
import { AnthropicSessionCard } from '../components/overview/AnthropicSessionCard';

export default function OverviewPage() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Header title="Dashboard" />

      {/* Row 1: Action Items + Nexus Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ActionItems />
        </div>
        <div className="lg:col-span-2">
          <NexusOvernight />
        </div>
      </div>

      {/* Row 2: Throughput + Status Distribution + Priority Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <ThroughputChart />
        </div>
        <div>
          <StatusDistribution />
        </div>
        <div>
          <PriorityBreakdown />
        </div>
      </div>

      {/* Row 3: Anthropic Session Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AnthropicSessionCard />
      </div>
    </div>
  );
}
