import { Component, ElementRef, HostBinding, Input } from "@angular/core";

// Increments for each instance of this component
let nextId = 0;

@Component({
  selector: "bit-label",
  standalone: true,
  templateUrl: "label.component.html",
})
export class BitLabel {
  constructor(private elementRef: ElementRef<HTMLInputElement>) {}

  @HostBinding("class") @Input() get classList() {
    return ["tw-inline-flex", "tw-gap-1", "tw-items-baseline", "tw-flex-row", "tw-min-w-0"];
  }

  @HostBinding("title") get title() {
    return this.elementRef.nativeElement.textContent;
  }

  @HostBinding() @Input() id = `bit-label-${nextId++}`;
}
