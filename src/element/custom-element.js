import { setPrototype, transformValue } from "./set-prototype.js";
import { createHooks } from "../hooks/create-hooks.js";
export { Any } from "./set-prototype.js";
import { flat, isHydrate } from "../utils.js";
/**
 * Class to extend for lifecycle assignment
 * @param {any} component - Function to transform into customElement
 * @param {Base} [Base] - Class to extend for lifecycle assignment
 */
export function c(component, Base = HTMLElement) {
    /**
     * @type {import("./set-prototype").Attrs}
     */
    let attrs = {};
    /**
     * @type {import("./set-prototype").Values}
     */
    let values = {};

    let { props, styles } = component;

    let Atom = class extends Base {
        constructor() {
            super();
            this._setup();
            this._render = () => component({ ...this._props });
            for (let prop in values) this[prop] = values[prop];
        }
        /**
         * @returns {Style[]|Style}
         */
        static get styles() {
            //@ts-ignore
            return [super.styles, styles];
        }
        async _setup() {
            // _setup only continues if _props has not been defined
            if (this._props) return;

            this._props = {};

            this.mounted = new Promise((resolve) => (this.mount = resolve));
            this.unmounted = new Promise((resolve) => (this.unmount = resolve));

            this.symbolId = this.symbolId || Symbol();

            let hooks = createHooks(() => this.update(), this);

            let prevent;

            let firstRender = true;

            // some DOM emulators don't define dataset
            const hydrate = isHydrate(this);

            this.update = () => {
                if (!prevent) {
                    prevent = true;

                    /**
                     * this.updated is defined at the runtime of the render,
                     * if it fails it is caught by mistake to unlock prevent
                     */
                    this.updated = (this.updated || this.mounted)
                        .then(() => {
                            try {
                                const result = hooks.load(this._render);

                                result &&
                                    result.render(this, this.symbolId, hydrate);

                                prevent = false;

                                if (firstRender) {
                                    firstRender = false;
                                    // @ts-ignore
                                    !hydrate && applyStyles(this);
                                }

                                return hooks.cleanEffects();
                            } finally {
                                // Remove lock in case of synchronous error
                                prevent = false;
                            }
                        })
                        // next tick
                        .then((cleanEffect) => {
                            cleanEffect && cleanEffect();
                        });
                }

                return this.updated;
            };

            this.update();

            await this.unmounted;

            hooks.cleanEffects(true)();
        }
        connectedCallback() {
            this.mount();
            //@ts-ignore
            super.connectedCallback && super.connectedCallback();
        }
        async disconnectedCallback() {
            //@ts-ignore
            super.disconnectedCallback && super.disconnectedCallback();
            // The webcomponent will only resolve disconnected if it is
            // actually disconnected of the document, otherwise it will keep the record.
            await this.mounted;
            !this.isConnected && this.unmount();
        }
        /**
         * @param {string} attr
         * @param {(string|null)} oldValue
         * @param {(string|null)} value
         */
        attributeChangedCallback(attr, oldValue, value) {
            if (attrs[attr]) {
                // _ignoreAttr exists temporarily
                // @ts-ignore
                if (attr === this._ignoreAttr || oldValue === value) return;
                // Choose the property name to send the update
                let { prop, type } = attrs[attr];
                this[prop] = transformValue(type, value);
            } else {
                // If the attribute does not exist in the scope attrs, the event is sent to super
                // @ts-ignore
                super.attributeChangedCallback(attr, oldValue, value);
            }
        }

        static get props() {
            //@ts-ignore
            return { ...super.props, ...props };
        }

        static get observedAttributes() {
            // See if there is an observedAttributes declaration to match with the current one
            // @ts-ignore
            let superAttrs = super.observedAttributes || [];
            for (let prop in props) {
                setPrototype(this.prototype, prop, props[prop], attrs, values);
            }
            return Object.keys(attrs).concat(superAttrs);
        }
    };

    return Atom;
}

/**
 * Attach the css to the shadowDom
 * @param {Base &  {shadowRoot: ShadowRoot, constructor: {styles: Style[] }} } host
 */
function applyStyles(host) {
    let { styles } = host.constructor;
    let { shadowRoot } = host;
    if (shadowRoot && styles.length) {
        let sheets = [];
        flat(styles, (value) => {
            if (value) {
                if (value instanceof Element) {
                    /**
                     * If it's an Element instance, it's assumed to be a CSSStyleSheet
                     * polyfill and clones the element to inject into the HTML
                     */
                    //@ts-ignore
                    shadowRoot.appendChild(value.cloneNode(true));
                } else {
                    sheets.push(value);
                }
            }
        });
        if (sheets.length) shadowRoot.adoptedStyleSheets = sheets;
    }
}

/**
 * @typedef {Object} ShadowRoot
 * @property {CSSStyleSheet[]} [adoptedStyleSheets]
 * @property {(child:ChildNode)=>void} appendChild
 */

/**
 * @typedef {typeof HTMLElement} Base
 */

/**
 * @typedef {Object} Context
 * @property {(value:any)=>void} mount
 * @property {(value:any)=>void} unmount
 * @property {Promise<void>} mounted
 * @property {Promise<void>} unmounted
 * @property {Promise<void>} updated
 * @property {()=>Promise<void>} update
 * @property {Object<string,any>} _props
 * @property {string} [_ignoreAttr]
 * @property {symbol} [symbolId]  - symbolId allows to obtain the symbol id that stores the state of the virtual-dom
 */

/**
 * @typedef {CSSStyleSheet|HTMLStyleElement} Style
 */

/**
 * @typedef { ReturnType<c> } Atom
 */

/**
 * @typedef { InstanceType< Atom > & {_ignoreAttr?: string } } AtomThis
 */
