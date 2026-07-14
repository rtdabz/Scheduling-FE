import SubjectManager from "./SubjectManager";

export default function Subjects() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Subjects</p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <SubjectManager />
      </div>
    </div>
  );
}
