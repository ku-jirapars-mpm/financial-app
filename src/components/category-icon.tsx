import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Car,
  CircleDollarSign,
  Clapperboard,
  CreditCard,
  Gift,
  GraduationCap,
  HandCoins,
  Hammer,
  HeartPulse,
  Home,
  Landmark,
  Percent,
  Receipt,
  Repeat,
  RotateCcw,
  Scale,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Users,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AccountKind, TransactionType } from "@/lib/domain";
import { cn } from "@/lib/utils";

const BY_CATEGORY: [RegExp, LucideIcon, string][] = [
  [/subscri|netflix|spotify|youtube|icloud|stream/i, Repeat, "#e50914"],
  [/food|dining|restaurant/i, Utensils, "#ff9500"],
  [/grocer/i, ShoppingBasket, "#34c759"],
  [/transport|car|fuel|taxi/i, Car, "#5ac8fa"],
  [/hous|rent/i, Home, "#af52de"],
  [/utilit|electric|water/i, Zap, "#ffcc00"],
  [/phone|internet/i, Smartphone, "#007aff"],
  [/health|medical/i, HeartPulse, "#ff2d55"],
  [/insur/i, Shield, "#5856d6"],
  [/shop/i, ShoppingBag, "#ff6482"],
  [/entertain|movie|game/i, Clapperboard, "#bf5af2"],
  [/educat|school|course/i, GraduationCap, "#0a84ff"],
  [/family|kid/i, Users, "#ff9f0a"],
  [/fee|interest|bank/i, Landmark, "#8e8e93"],
  [/salary|wage/i, Briefcase, "#30b0c7"],
  [/bonus|gift/i, Gift, "#ff375f"],
  [/dividend/i, Percent, "#32ade6"],
];

const BY_TYPE: Partial<Record<TransactionType, [LucideIcon, string]>> = {
  transfer: [ArrowLeftRight, "#8e8e93"],
  debt_payment: [CreditCard, "#5856d6"],
  adjustment: [Scale, "#8e8e93"],
  fee: [Receipt, "#8e8e93"],
  interest: [Percent, "#8e8e93"],
  refund: [RotateCcw, "#34c759"],
  lend: [HandCoins, "#ff9f0a"],
  collect: [HandCoins, "#34c759"],
  income: [CircleDollarSign, "#34c759"],
  expense: [Receipt, "#ff9500"],
};

const BY_ACCOUNT: Record<AccountKind, [LucideIcon, string]> = {
  cash: [Banknote, "#34c759"],
  bank: [Landmark, "#007aff"],
  e_wallet: [Wallet, "#30b0c7"],
  credit_card: [CreditCard, "#5856d6"],
  loan: [Scale, "#ff9500"],
  other_asset: [CircleDollarSign, "#8e8e93"],
  other_liability: [Receipt, "#8e8e93"],
};

function Bubble({ Icon, color, className }: { Icon: LucideIcon; color: string; className?: string }) {
  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", className)}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <Icon className="size-[18px]" strokeWidth={2.2} />
    </span>
  );
}

export function TransactionIcon({ type, category }: { type: TransactionType; category: string | null }) {
  if (category && (type === "income" || type === "expense" || type === "refund")) {
    const match = BY_CATEGORY.find(([re]) => re.test(category));
    if (match) return <Bubble Icon={match[1]} color={match[2]} />;
  }
  const [Icon, color] = BY_TYPE[type] ?? [Receipt, "#8e8e93"];
  return <Bubble Icon={Icon} color={color} />;
}

export function AccountIcon({ kind }: { kind: AccountKind }) {
  const [Icon, color] = BY_ACCOUNT[kind];
  return <Bubble Icon={Icon} color={color} />;
}

export function SubscriptionIcon() {
  return <Bubble Icon={Repeat} color="#e50914" />;
}

const BY_RECEIVABLE: Record<"work" | "loan" | "reimbursement" | "other", [LucideIcon, string]> = {
  work: [Hammer, "#0a84ff"],
  loan: [HandCoins, "#ff9f0a"],
  reimbursement: [RotateCcw, "#34c759"],
  other: [CircleDollarSign, "#8e8e93"],
};

export function ReceivableIcon({ kind }: { kind: "work" | "loan" | "reimbursement" | "other" }) {
  const [Icon, color] = BY_RECEIVABLE[kind];
  return <Bubble Icon={Icon} color={color} />;
}
