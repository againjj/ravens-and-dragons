import type { RuleDescriptionSection } from "../game-types.js";

interface RulesPanelProps {
    title?: string;
    sections: RuleDescriptionSection[];
}

export const RulesPanel = ({ title = "Rules", sections }: RulesPanelProps) => (
    <section className="legend">
        <h2>{title}</h2>
        {sections.map((section, index) => (
            <div key={`${section.heading ?? "section"}-${index}`} className="legend-section">
                {section.heading ? <h3>{section.heading}</h3> : null}
                {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                ))}
            </div>
        ))}
    </section>
);
