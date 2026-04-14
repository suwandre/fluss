"use client";

import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ASSET_CLASSES, type AssetClass } from "@/lib/types/visual";
import { currencyDisplay, pnlPercent } from "@/lib/format";

export interface NewHolding {
  ticker: string;
  quantity: number;
  avgCost: number;
  assetClass: AssetClass;
}

type TickerValidation = { status: "idle" } | { status: "loading" } | { status: "success"; price: number; changePct: number | null } | { status: "error"; message: string };

interface HoldingsInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (holding: NewHolding) => void;
}

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: "Equity",
  etf: "ETF",
  crypto: "Crypto",
  bond: "Bond",
  fx: "FX",
};

export function HoldingsInput({ open, onOpenChange, onSubmit }: HoldingsInputProps) {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("equity");
  const [submitting, setSubmitting] = useState(false);
  const [tickerValidation, setTickerValidation] = useState<TickerValidation>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const resetForm = useCallback(() => {
    setTicker("");
    setQuantity("");
    setAvgCost("");
    setAssetClass("equity");
    setSubmitting(false);
    setTickerValidation({ status: "idle" });
    abortRef.current?.abort();
  }, []);

  const validateTicker = useCallback(async (tickerValue: string) => {
    const trimmed = tickerValue.trim();
    if (!trimmed) {
      setTickerValidation({ status: "idle" });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTickerValidation({ status: "loading" });

    const upperTicker = trimmed.toUpperCase();
    const url = `/api/market/snapshot/${encodeURIComponent(upperTicker)}?assetClass=${assetClass}`;

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Not found" }));
        setTickerValidation({ status: "error", message: body.error ?? `Ticker "${upperTicker}" not found` });
        return;
      }

      const data = await res.json();
      if (data.price == null) {
        setTickerValidation({ status: "error", message: `No price data for "${upperTicker}"` });
        return;
      }

      setTickerValidation({ status: "success", price: data.price, changePct: data.changePercent1d ?? null });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setTickerValidation({ status: "error", message: "Failed to validate ticker" });
    }
  }, [assetClass]);

  const handleSubmit = () => {
    if (!ticker.trim() || !quantity || !avgCost) return;
    if (isNaN(Number(quantity)) || isNaN(Number(avgCost))) return;

    setSubmitting(true);
    onSubmit({
      ticker: ticker.trim().toUpperCase(),
      quantity: Number(quantity),
      avgCost: Number(avgCost),
      assetClass,
    });
    resetForm();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const isValid =
    ticker.trim().length > 0 &&
    quantity !== "" &&
    !isNaN(Number(quantity)) &&
    Number(quantity) > 0 &&
    avgCost !== "" &&
    !isNaN(Number(avgCost)) &&
    Number(avgCost) > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Holding</DialogTitle>
          <DialogDescription>
            Enter ticker, quantity, average cost, and asset class for a new holding.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="holding-ticker" className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Ticker Symbol
            </label>
            <Input
              id="holding-ticker"
              placeholder="e.g. AAPL, BTC"
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                if (tickerValidation.status !== "idle") setTickerValidation({ status: "idle" });
              }}
              onBlur={() => validateTicker(ticker)}
              className={`font-mono ${
                tickerValidation.status === "success" ? "border-[--green]" : tickerValidation.status === "error" ? "border-[--red]" : ""
              }`}
            />
            {tickerValidation.status === "loading" && (
              <span className="text-xs text-text-muted">Validating…</span>
            )}
            {tickerValidation.status === "success" && (
              <span className="text-xs text-[--green]">
                {currencyDisplay(tickerValidation.price)}
                {tickerValidation.changePct != null && ` (${pnlPercent(tickerValidation.changePct)})`}
              </span>
            )}
            {tickerValidation.status === "error" && (
              <span className="text-xs text-[--red]">{tickerValidation.message}</span>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="holding-quantity" className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Quantity
              </label>
              <Input
                id="holding-quantity"
                type="number"
                placeholder="0"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="holding-avg-cost" className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Avg Cost ($)
              </label>
              <Input
                id="holding-avg-cost"
                type="number"
                placeholder="0.00"
                min="0"
                step="any"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Asset Class
            </label>
            <Select value={assetClass} onValueChange={(val) => setAssetClass(val as AssetClass)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select asset class" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((ac) => (
                  <SelectItem key={ac} value={ac}>
                    {ASSET_CLASS_LABELS[ac]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            Add Holding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
