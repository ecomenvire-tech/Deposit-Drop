import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect, useRef} from 'preact/hooks';
import {getDirectBackendUrl} from './backend-url';

export default function extension() {
  render(<Extension />, document.body);
}

const BANK_DEPOSIT_HANDLES = new Set([
  'manual-payment-bank deposit',
  'manual-payment-961db836ca3d0093f9ab48092a8a4fa5',
]);

function isBankDepositOption(option) {
  if (option?.type !== 'manualPayment') {
    return false;
  }

  const handle = option?.handle?.toLowerCase() ?? '';
  const title = option?.title?.toLowerCase() ?? '';
  const name = option?.name?.toLowerCase() ?? '';
  const label = option?.label?.toLowerCase() ?? '';

  const isKnownHandle = BANK_DEPOSIT_HANDLES.has(handle);
  const isBankDepositName =
    handle.includes('bank') && handle.includes('deposit') ||
    title.includes('bank') && title.includes('deposit') ||
    name.includes('bank') && name.includes('deposit') ||
    label.includes('bank') && label.includes('deposit');

  return isKnownHandle || isBankDepositName;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function getCandidateEndpoints() {
  const url = getDirectBackendUrl(
    shopify.settings?.value?.backend_api_url,
    '/api/bank-deposit-receipt',
  );
  return url ? [{ label: 'app backend', url }] : [];
}

function Extension() {
  const [receiptUploaded, setReceiptUploaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [hasBankDepositSelected, setHasBankDepositSelected] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const dropZoneRef = useRef(null);

  const getSelectedFile = (event) => {
    const files =
      event?.currentTarget?.files ||
      event?.target?.files ||
      dropZoneRef.current?.files ||
      null;

    if (!files) return null;
    if (Array.isArray(files)) return files[0] ?? null;
    return files[0] ?? (typeof files.item === 'function' ? files.item(0) : null);
  };

  const uploadReceipt = async (event) => {
    const receiptFile = getSelectedFile(event);
    if (!receiptFile) {
      setErrorMessage('Please select a receipt image.');
      setReceiptUploaded(false);
      setPreviewUrl(null);
      return;
    }

    // Show a local preview immediately, before the upload even starts - this
    // never leaves the browser. A base64 data URL is used instead of
    // URL.createObjectURL() because the checkout image component doesn't
    // reliably detect when a blob: URL has finished loading, leaving the
    // thumbnail invisible forever.
    try {
      const previewBuffer = await receiptFile.arrayBuffer();
      setPreviewUrl(
        `data:${receiptFile.type || 'image/jpeg'};base64,${arrayBufferToBase64(previewBuffer)}`,
      );
    } catch (previewError) {
      console.error('[bank-deposit-receipt] Preview generation failed:', previewError);
      setPreviewUrl(null);
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (receiptFile.size > MAX_SIZE) {
      setErrorMessage(
        `File too large. Max size: 5MB, your file: ${(receiptFile.size / 1024 / 1024).toFixed(2)}MB`,
      );
      setReceiptUploaded(false);
      return;
    }

    const candidates = getCandidateEndpoints();
    if (candidates.length === 0) {
      setErrorMessage('Backend URL is not configured and the shop domain is unavailable.');
      setReceiptUploaded(false);
      return;
    }

    console.log(
      '[bank-deposit-receipt] Upload started. Endpoint candidates (in order):',
      candidates.map((c) => `${c.label} -> ${c.url}`),
    );
    console.log('[bank-deposit-receipt] File:', {
      name: receiptFile.name,
      type: receiptFile.type,
      size: receiptFile.size,
    });

    setUploading(true);
    setErrorMessage(null);

    try {
      const token = await shopify.sessionToken.get();
      const fileBuffer = await receiptFile.arrayBuffer();
      const checkoutId = shopify.checkoutToken?.value ?? shopify.checkoutToken ?? null;

      console.log('[bank-deposit-receipt] Session token acquired, sending request');

      const requestBody = JSON.stringify({
        file: {
          name: receiptFile.name,
          type: receiptFile.type || 'application/octet-stream',
          size: receiptFile.size,
          data: arrayBufferToBase64(fileBuffer),
        },
        checkoutId,
      });

      let response = null;
      let lastNetworkError = null;

      for (const candidate of candidates) {
        console.log(`[bank-deposit-receipt] Trying ${candidate.label}:`, candidate.url);
        try {
          response = await fetch(candidate.url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: requestBody,
          });
          console.log(`[bank-deposit-receipt] ${candidate.label} responded with status`, response.status);
          break;
        } catch (networkError) {
          lastNetworkError = networkError;
          console.error(
            `[bank-deposit-receipt] ${candidate.label} unreachable (${candidate.url}):`,
            networkError?.message,
          );
        }
      }

      if (!response) {
        throw lastNetworkError || new Error('All upload endpoints were unreachable.');
      }

      const text = await response.text();
      let result = {};
      try {
        result = JSON.parse(text);
      } catch {
        console.warn('Response not JSON:', text);
      }

      if (!response.ok) {
        throw new Error(result?.error || result?.message || `HTTP ${response.status}: Receipt upload failed.`);
      }

      console.log('[bank-deposit-receipt] Upload success:', result);
      setReceiptUploaded(true);
      setErrorMessage(null);
    } catch (error) {
      console.error('[bank-deposit-receipt] Upload failure:', error);
      console.error('[bank-deposit-receipt] Error stack:', error?.stack);
      setReceiptUploaded(false);

      const message = error?.message || 'Receipt upload failed.';
      if (message.includes('Failed to fetch') || message.includes('unreachable')) {
        setErrorMessage(
          'Could not reach the upload server. Confirm the app is running (`npm run dev`) and try again.',
        );
      } else {
        setErrorMessage(message);
      }
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!hasBankDepositSelected) {
      setErrorMessage(null);
      return;
    }

    if (!receiptUploaded) {
      setErrorMessage('Please upload the receipt from here before completing the order.');
    } else {
      setErrorMessage(null);
    }
  }, [hasBankDepositSelected, receiptUploaded]);

  useEffect(() => {
    const updateSelection = (value) => {
      const selectedOptions = Array.isArray(value) ? value : value ? [value] : [];
      const handles = selectedOptions.map((option) => option?.handle ?? option?.title ?? 'unknown');
      const isBankDeposit = selectedOptions.some(isBankDepositOption);

      console.log('Bank deposit selection debug:', {
        selectedOptions,
        handles,
        isBankDeposit,
      });

      setHasBankDepositSelected(isBankDeposit);

      if (!isBankDeposit) {
        setReceiptUploaded(false);
        setErrorMessage(null);
        setPreviewUrl(null);
        if (dropZoneRef.current) {
          dropZoneRef.current.value = '';
        }
      }
    };

    const syncSelection = () => {
      updateSelection(shopify.selectedPaymentOptions.value ?? []);
    };

    syncSelection();
    const timeoutId = window.setTimeout(syncSelection, 50);

    const unsubscribe = shopify.selectedPaymentOptions.subscribe((value) => {
      updateSelection(value ?? []);
    });

    return () => {
      if (unsubscribe) unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!shopify.buyerJourney || typeof shopify.buyerJourney.intercept !== 'function') {
      return;
    }

    let stopIntercept = null;
    let active = true;

    void shopify.buyerJourney
      .intercept(({canBlockProgress}) => {
        if (!canBlockProgress) {
          return {behavior: 'allow'};
        }

        if (hasBankDepositSelected && !receiptUploaded) {
          return {
            behavior: 'block',
            reason: 'RECEIPT_REQUIRED',
            errors: [
              {
                message: 'Please upload the receipt from here before completing the order.',
              },
            ],
          };
        }

        return {behavior: 'allow'};
      })
      .then((cleanup) => {
        if (active) {
          stopIntercept = cleanup;
        }
      });

    return () => {
      active = false;
      if (typeof stopIntercept === 'function') {
        stopIntercept();
      }
    };
  }, [hasBankDepositSelected, receiptUploaded]);

  if (!hasBankDepositSelected) {
    return null;
  }

  return (
    <s-section heading="Bank Deposit Receipt">
      <s-stack direction="block" gap="base">
        {errorMessage ? <s-text tone="critical">{errorMessage}</s-text> : null}
        {!errorMessage && receiptUploaded ? (
          <s-text tone="success">✓ Receipt image uploaded successfully.</s-text>
        ) : null}

        <s-box maxInlineSize="188px">
          <s-drop-zone
            ref={dropZoneRef}
            label="Payment receipt upload (Required)"
            name="bank-deposit-receipt"
            required
            accept="image/*"
            loading={uploading}
            onChange={uploadReceipt}
          ></s-drop-zone>
        </s-box>

        {previewUrl ? (
          <s-stack direction="inline" gap="small-100">
            <s-box
              inlineSize="56px"
              blockSize="56px"
              borderRadius="base"
              border="base"
              overflow="hidden"
            >
              <s-image
                src={previewUrl}
                inlineSize="fill"
                objectFit="cover"
                accessibilityRole="presentation"
              />
            </s-box>
            <s-text tone="neutral">Receipt preview</s-text>
          </s-stack>
        ) : null}
      </s-stack>
    </s-section>
  );
}
