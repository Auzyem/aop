-- Rename priceUsdPerTroyOz to priceUsdPerKg to match new metals.dev USD/kg API
ALTER TABLE "lme_price_records" RENAME COLUMN "priceUsdPerTroyOz" TO "priceUsdPerKg";
