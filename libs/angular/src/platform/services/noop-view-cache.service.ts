import { Injectable, signal, WritableSignal } from "@angular/core";
import type { FormGroup } from "@angular/forms";

import {
  FormCacheOptions,
  SignalCacheOptions,
  ViewCacheService,
} from "../abstractions/view-cache.service";

@Injectable({
  providedIn: "root",
})
export class NoopViewCacheService implements ViewCacheService {
  /**
   * Return a normal signal.
   */
  signal<T>(options: SignalCacheOptions<T>): WritableSignal<T> {
    return signal(options.initialValue);
  }

  /**
   * Return the original form group.
   **/
  formGroup<TFormGroup extends FormGroup>(options: FormCacheOptions<TFormGroup>): TFormGroup {
    return options.control;
  }
}
