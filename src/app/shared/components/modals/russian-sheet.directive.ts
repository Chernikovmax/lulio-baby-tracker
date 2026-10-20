import { Directive, ElementRef, inject } from '@angular/core';

/** Ionic 9 hardcodes the sheet handle label; localize its documented handle part. */
@Directive({
  selector: 'ion-modal[appRussianSheet]',
  host: {
    '(ionModalDidPresent)': 'localizeHandle()',
    '(ionBreakpointDidChange)': 'localizeHandle()',
  },
})
export class RussianSheetDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  localizeHandle(): void {
    this.element.nativeElement.shadowRoot?.querySelector('[part="handle"]')
      ?.setAttribute('aria-label', 'Изменить высоту окна');
  }
}
