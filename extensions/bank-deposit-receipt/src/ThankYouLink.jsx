import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect} from 'preact/hooks';
import {getDirectBackendUrl} from './backend-url';

export default function extension() {
  render(<ThankYouLink />, document.body);
}

// This extension renders no visible UI on the Thank You page. It only links
// a previously-uploaded bank deposit receipt (identified by checkoutToken)
// to the order that was just created, using data the buyer is already
// seeing on this page (their own checkout token and order confirmation) -
// no admin scope or webhook is needed.
function ThankYouLink() {
  useEffect(() => {
    let cancelled = false;

    async function link() {
      const checkoutToken = shopify.checkoutToken?.value;
      const order = shopify.orderConfirmation?.value?.order;

      if (!checkoutToken || !order?.id) {
        return;
      }

      const backendUrl = getDirectBackendUrl(
        shopify.settings?.value?.backend_api_url,
        '/api/link-receipt-order',
      );
      if (!backendUrl) {
        return;
      }

      const numericOrderId = order.id.split('/').pop();
      const orderNumber = shopify.orderConfirmation?.value?.number;

      try {
        const token = await shopify.sessionToken.get();
        console.log('[bank-deposit-receipt] Linking order to receipt:', numericOrderId);

        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            checkoutToken,
            orderId: numericOrderId,
            orderName: orderNumber ? `#${orderNumber}` : null,
          }),
        });

        if (!cancelled) {
          console.log('[bank-deposit-receipt] Order link response status:', response.status);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[bank-deposit-receipt] Order link failed:', error);
        }
      }
    }

    link();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
