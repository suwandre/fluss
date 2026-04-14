"use client";

import { useState, useCallback } from "react";
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

export interface NewHolding {
  ticker: string;
  quantity: number;
  avgCost: number;
  assetClass: AssetClass;
}

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

  const resetForm = useCallback(() => {
    setTicker("");
    setQuantity("");
    setAvgCost("");
    setAssetClass("equity");
    setSubmitting(false);
  }, []);

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
              onChange={(e) => setTicker(e.target.value)}
              className="font-mono"
            />
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
