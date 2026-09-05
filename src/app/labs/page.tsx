import AiPractitionerDock from '@/components/labs/AiPractitionerDock';
import LabRuntimePanel from '@/components/labs/LabRuntimePanel';
import LabTopologyPersistenceBridge from '@/components/labs/LabTopologyPersistenceBridge';

export default function CyberLabPage() {
  return (
    <>
      <LabTopologyPersistenceBridge>
        <LabRuntimePanel />
      </LabTopologyPersistenceBridge>
      <AiPractitionerDock />
    </>
  );
}
