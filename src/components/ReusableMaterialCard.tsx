import type { ReusableMaterial } from '../types';

interface Props {
  material: ReusableMaterial;
  onCopy?: () => void;
  copyLabel?: string;
}

export function ReusableMaterialCard({ material, onCopy, copyLabel = '复制到 GPT 语音复习' }: Props) {
  return (
    <section className="space-y-4 rounded-lg border border-[var(--accent)] bg-[var(--accent-bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--accent)]">可复用复习材料 · AI 参考版本</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{material.titleZh}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{material.situationZh}</p>
        </div>
        {onCopy && (
          <button
            onClick={onCopy}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
          >
            {copyLabel}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {material.sections.map((section) => (
          <div key={section.index} className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              第{section.index}节 · {section.titleZh}
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">{section.chineseRoute}</p>
            <p className="mt-2 text-sm text-[var(--accent)]">EN · {section.english}</p>
            <p className="mt-1 text-sm text-[var(--rose)]">JA · {section.japanese}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-[var(--bg-primary)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--accent)]">完整英语稿</p>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{material.fullEnglish}</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-primary)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--rose)]">完整日语稿</p>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{material.fullJapanese}</p>
        </div>
      </div>

      {material.expressions.length > 0 && (
        <div className="border-t border-[var(--border-light)] pt-3">
          <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">高复用表达</p>
          <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
            {material.expressions.map((item, index) => (
              <li key={index}>
                <span className="font-medium text-[var(--text-primary)]">{item.meaningZh}</span>
                {' · '}EN: {item.english}{' · '}JA: {item.japanese}
                {item.replaceablePart && <span className="text-[var(--text-tertiary)]">（可替换：{item.replaceablePart}）</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {material.actualErrorNotesZh && material.actualErrorNotesZh.length > 0 && (
        <div className="border-t border-[var(--border-light)] pt-3">
          <p className="mb-1 text-xs font-semibold text-[var(--amber)]">本次实际易错点</p>
          <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
            {material.actualErrorNotesZh.map((note, index) => <li key={index}>• {note}</li>)}
          </ul>
        </div>
      )}

      {material.learnerNotesZh && (
        <p className="border-t border-[var(--border-light)] pt-3 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--accent)]">复习要点：</span>
          {material.learnerNotesZh}
        </p>
      )}

      {material.transferScenarioZh && (
        <p className="border-t border-[var(--border-light)] pt-3 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--emerald)]">相似迁移情境：</span>
          {material.transferScenarioZh}
        </p>
      )}
    </section>
  );
}
