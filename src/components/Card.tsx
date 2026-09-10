import type {
  CSSProperties,
  PointerEventHandler,
  MouseEventHandler,
} from "react";
import { red, type Card as CardModel } from "../game";

export const suitSymbol = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

export const suitName = {
  spades: "пики",
  hearts: "черви",
  diamonds: "бубны",
  clubs: "трефы",
} as const;

export const rankName = (rank: number) =>
  (({ 1: "Т", 11: "В", 12: "Д", 13: "К" }) as Record<number, string>)[rank] ??
  `${rank}`;

export const cardLabel = (card: CardModel) =>
  `${rankName(card.rank)} ${suitName[card.suit]}`;

type Pip = [number, number, boolean?];
const pips: Record<number, Pip[]> = {
  2: [
    [50, 25],
    [50, 75, true],
  ],
  3: [
    [50, 22],
    [50, 50],
    [50, 78, true],
  ],
  4: [
    [33, 25],
    [67, 25],
    [33, 75, true],
    [67, 75, true],
  ],
  5: [
    [33, 23],
    [67, 23],
    [50, 50],
    [33, 77, true],
    [67, 77, true],
  ],
  6: [
    [33, 22],
    [67, 22],
    [33, 50],
    [67, 50],
    [33, 78, true],
    [67, 78, true],
  ],
  7: [
    [33, 19],
    [67, 19],
    [50, 35],
    [33, 50],
    [67, 50],
    [33, 81, true],
    [67, 81, true],
  ],
  8: [
    [33, 18],
    [67, 18],
    [50, 34],
    [33, 46],
    [67, 46],
    [50, 66, true],
    [33, 82, true],
    [67, 82, true],
  ],
  9: [
    [33, 17],
    [67, 17],
    [33, 39],
    [67, 39],
    [50, 50],
    [33, 61, true],
    [67, 61, true],
    [33, 83, true],
    [67, 83, true],
  ],
  10: [
    [33, 15],
    [67, 15],
    [50, 28],
    [33, 38],
    [67, 38],
    [33, 62, true],
    [67, 62, true],
    [50, 72, true],
    [33, 85, true],
    [67, 85, true],
  ],
};

export function CardFace({ card }: { card: CardModel }) {
  const symbol = suitSymbol[card.suit];
  return (
    <div className="card-face">
      <span className="card-corner">
        <strong>{rankName(card.rank)}</strong>
        <span>{symbol}</span>
      </span>
      {card.rank === 1 && (
        <div className="ace-mark" aria-hidden="true">
          <span>{symbol}</span>
          <i />
        </div>
      )}
      {card.rank >= 2 && card.rank <= 10 && (
        <div className="pip-field" aria-hidden="true">
          {pips[card.rank].map(([x, y, flipped], index) => (
            <span
              key={index}
              className={flipped ? "pip pip-flipped" : "pip"}
              style={
                { "--pip-x": `${x}%`, "--pip-y": `${y}%` } as CSSProperties
              }
            >
              {symbol}
            </span>
          ))}
        </div>
      )}
      {card.rank >= 11 && <CourtCard card={card} />}
      <span className="card-corner card-corner-bottom">
        <strong>{rankName(card.rank)}</strong>
        <span>{symbol}</span>
      </span>
    </div>
  );
}

function CourtCard({ card }: { card: CardModel }) {
  const symbol = suitSymbol[card.suit];
  const crown = card.rank === 13 ? "♛" : card.rank === 12 ? "✦" : "◆";
  return (
    <div className={`court court-${card.rank}`} aria-hidden="true">
      <svg viewBox="0 0 100 144" role="presentation">
        <path
          className="court-frame"
          d="M17 8h66l9 13v102l-9 13H17l-9-13V21z"
        />
        <path className="court-panel" d="M18 20h64v104H18z" />
        <path className="court-band" d="M18 69 82 39v36L18 105z" />
        <circle className="court-head" cx="50" cy="47" r="13" />
        <path
          className="court-body"
          d="M28 90c4-24 12-31 22-31s18 7 22 31l-22 17z"
        />
        <text className="court-crown" x="50" y="31">
          {crown}
        </text>
        <text className="court-suit" x="50" y="96">
          {symbol}
        </text>
        <text className="court-rank" x="50" y="122">
          {rankName(card.rank)}
        </text>
      </svg>
    </div>
  );
}

export function CardBack() {
  return (
    <div className="card-back" aria-hidden="true">
      <div className="back-border">
        <div className="back-rosette">♠</div>
      </div>
    </div>
  );
}

type CardViewProps = {
  card: CardModel;
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
  disabled?: boolean;
  selected?: boolean;
  ghosted?: boolean;
  hinted?: boolean;
  dealingIndex?: number;
  justFlipped?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
};

export function CardView({
  card,
  className = "",
  style,
  interactive = true,
  disabled,
  selected,
  ghosted,
  hinted,
  dealingIndex,
  justFlipped,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: CardViewProps) {
  const classes = [
    "playing-card",
    card.faceUp ? (red(card) ? "red" : "black") : "is-back",
    selected && "is-selected",
    ghosted && "is-ghosted",
    hinted && "is-source-hint",
    justFlipped && "is-flipping",
    dealingIndex !== undefined && "is-dealing",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const mergedStyle =
    dealingIndex === undefined
      ? style
      : ({
          ...style,
          "--deal-delay": `${Math.min(dealingIndex * 20, 420)}ms`,
        } as CSSProperties);
  const content = card.faceUp ? <CardFace card={card} /> : <CardBack />;
  if (!interactive)
    return (
      <div className={classes} style={mergedStyle}>
        {content}
      </div>
    );
  return (
    <button
      type="button"
      className={classes}
      style={mergedStyle}
      data-card-id={card.id}
      aria-label={card.faceUp ? cardLabel(card) : "Закрытая карта"}
      aria-pressed={card.faceUp ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {content}
    </button>
  );
}
