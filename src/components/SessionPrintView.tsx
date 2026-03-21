import { X } from 'lucide-react';
import { BLOCK_CATEGORY_META, type PracticeSession, type Drill } from '../types/drill.ts';

interface Props {
  session: PracticeSession;
  drills: Drill[];
  onClose: () => void;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `0:${m.toString().padStart(2, '0')}`;
}

export default function SessionPrintView({ session, drills, onClose }: Props) {
  const drillMap = new Map(drills.map(d => [d.id, d]));
  const totalMin = session.blocks.reduce((a, b) => a + b.durationMinutes, 0);

  const handlePrint = () => {
    window.print();
  };

  let cumulative = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm print:bg-white print:backdrop-blur-none">
      <div className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto print:shadow-none print:rounded-none print:max-w-none print:max-h-none print:mx-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between print:border-b-2 print:border-gray-900">
          <div>
            <h2 className="text-lg font-bold">PRACTICE PLAN</h2>
            <div className="text-sm text-gray-500 mt-0.5">
              {session.name} &middot; Total: {totalMin} min &middot; {new Date().toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer print:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase">
              <th className="px-6 py-2 w-16">Time</th>
              <th className="px-4 py-2">Drill</th>
              <th className="px-4 py-2 w-20">Duration</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {session.blocks.map(block => {
              const startMin = cumulative;
              cumulative += block.durationMinutes;
              const meta = BLOCK_CATEGORY_META[block.category];
              const linked = block.drillId ? drillMap.get(block.drillId) : null;

              return (
                <tr key={block.id} className="border-b border-gray-100">
                  <td className="px-6 py-2.5 text-gray-500 font-mono text-xs">
                    {formatTime(startMin)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="font-medium">
                        {block.name}
                        {linked && <span className="text-gray-400 font-normal ml-1">({linked.name})</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{block.durationMinutes} min</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{block.notes || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-center gap-3 print:hidden">
          <button
            onClick={handlePrint}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            Print
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(.fixed) { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
