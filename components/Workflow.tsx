interface WorkflowProps {
  steps: string[];
}

export function Workflow({ steps }: WorkflowProps) {
  return (
    <div className="workflow">
      {steps.map((step, index) => (
        <span key={index} className={`workflow-step ${index === steps.length - 1 ? 'current' : ''}`}>
          {step}
        </span>
      ))}
    </div>
  );
}
