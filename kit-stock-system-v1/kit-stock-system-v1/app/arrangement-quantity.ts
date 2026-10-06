export function validArrangementQuantity(value: string | number, maximum: number) {
 const quantity = Number(value);
 return String(value).trim() !== '' && Number.isSafeInteger(quantity) && quantity > 0 && Number.isSafeInteger(maximum) && quantity <= maximum;
}
