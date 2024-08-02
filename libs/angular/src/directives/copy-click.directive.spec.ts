import { Component, ElementRef, ViewChild } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ToastService } from "@bitwarden/components";

import { CopyClickDirective } from "./copy-click.directive";

@Component({
  template: `
    <button appCopyClick="no toast shown" #noToast></button>
    <button appCopyClick="info toast shown" showToast="info" #infoToast></button>
    <button appCopyClick="success toast shown" showToast #successToast></button>
  `,
})
class TestCopyClickComponent {
  @ViewChild("noToast") noToastButton: ElementRef<HTMLButtonElement>;
  @ViewChild("infoToast") infoToastButton: ElementRef<HTMLButtonElement>;
  @ViewChild("successToast") successToastButton: ElementRef<HTMLButtonElement>;
}

describe("CopyClickDirective", () => {
  let fixture: ComponentFixture<TestCopyClickComponent>;
  const copyToClipboard = jest.fn();
  const showToast = jest.fn();

  beforeEach(async () => {
    copyToClipboard.mockClear();
    showToast.mockClear();

    await TestBed.configureTestingModule({
      declarations: [CopyClickDirective, TestCopyClickComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: PlatformUtilsService, useValue: { copyToClipboard } },
        { provide: ToastService, useValue: { showToast } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestCopyClickComponent);
    fixture.detectChanges();
  });

  it("copies the the value for all variants of toasts ", () => {
    const noToastButton = fixture.componentInstance.noToastButton.nativeElement;

    noToastButton.click();
    expect(copyToClipboard).toHaveBeenCalledWith("no toast shown");

    const infoToastButton = fixture.componentInstance.infoToastButton.nativeElement;

    infoToastButton.click();
    expect(copyToClipboard).toHaveBeenCalledWith("info toast shown");

    const successToastButton = fixture.componentInstance.successToastButton.nativeElement;

    successToastButton.click();
    expect(copyToClipboard).toHaveBeenCalledWith("success toast shown");
  });

  it("does not show a toast when showToast is not present", () => {
    const noToastButton = fixture.componentInstance.noToastButton.nativeElement;

    noToastButton.click();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("shows a success toast when showToast is present", () => {
    const successToastButton = fixture.componentInstance.successToastButton.nativeElement;

    successToastButton.click();
    expect(showToast).toHaveBeenCalledWith({
      message: "copySuccessful",
      title: null,
      variant: "success",
    });
  });

  it("shows the toast variant when set with showToast", () => {
    const infoToastButton = fixture.componentInstance.infoToastButton.nativeElement;

    infoToastButton.click();
    expect(showToast).toHaveBeenCalledWith({
      message: "copySuccessful",
      title: null,
      variant: "info",
    });
  });
});
