import * as d3 from 'd3'

(() => {

    const sides_opposites = {
        left: 'right',
        right: 'left',
        top: 'bottom',
        bottom: 'top'
    };
    const sides_containers = {
        left: 'width',
        right: 'width',
        top: 'height',
        bottom: 'height'
    };
    const containers = ['height', 'width'];

    function normalize_to_percent_and_offset(value) {
        let percent = 0.0;
        let pixel_offset = 0;
        const calc_match = value.match(/calc\(\s*([0-9.]*)%\s*([-+])\s*([0-9]*)px/);
        if (calc_match) {
            percent = parseFloat(calc_match[1]);
            pixel_offset = parseInt(calc_match[3]);
            if (calc_match[2] === "-") {
                pixel_offset = -pixel_offset;
            }
        } else if (String(value).includes('%')) {
            percent = parseFloat(value.replace('%', ''));
        } else {
            pixel_offset = parseInt(value, 10);
        }
        return {
            percent,
            pixel_offset
        }
    }

    /**
     * converts px to % for  width/height/left/right/top/bottom
     * @param element a DOM element
     * @param property width/height or direction
     * @param value property value in px
     */
    function to_relative_percent(element, property, value) {
        const offsetParent = element.offsetParent;
        if (!offsetParent) {
            return 0;
        }
        let target_style_property = property; // width/height
        if (sides_containers.hasOwnProperty(property)) {
            target_style_property = sides_containers[property]; //left/right/top/bottom
        }
        const parent_size = Math.max(1, parseInt(getComputedStyle(offsetParent)[target_style_property], 10));
        return parseFloat(100 * value / parent_size);
    }

    /**
     * this funciton changes px positioniong to % and back, keeping the element at the same place
     * margins are dissovled into position
     * @param element - target element to modify
     * @param new_props - next props map e.g.: {width:'100px',left:'10%'} will change element's width by px and left by %...
     * ... if the element previosly had 'right', 'right-margin' it will be reomved while keeping element in the same place
     */
    function convert_to_matching_positioning(element, new_props) {


        const computed_element_style = getComputedStyle(element);

        Object.entries(new_props).forEach(([property, value]) => {
            if (sides_opposites.hasOwnProperty(property)) {
                const to_percent = String(value).includes('%');

                let new_prop_value = parseInt(computed_element_style[property], 10) +
                    parseInt(computed_element_style['margin-' + property], 10);

                if (to_percent) {
                    new_prop_value = to_relative_percent(element, property, new_prop_value).toFixed(4) + '%';
                } else {
                    new_prop_value += 'px';
                }

                element.style[property] = new_prop_value;
                element.style['margin-' + property] = 0;
                element.style['margin-' + sides_opposites[property]] = 0;

                if (element.style[sides_opposites[property]]) {
                    element.style[sides_opposites[property]] = 'auto';
                }
            } else if (containers.includes(property)) {
                const to_percent = String(value).includes('%');
                let new_prop_value = parseInt(computed_element_style[property]);
                if (to_percent) {
                    new_prop_value = to_relative_percent(element, property, new_prop_value).toFixed(4) + '%';
                } else {
                    new_prop_value += 'px';
                }
                element.style[property] = new_prop_value;
            }
        });
    }

    /** this function sets up  listeners. when a listener is activated event_handler is called.
     * it returns a cleanup closure which cleans up those listeners when invoked
     **/
    function setup_listener(root_element, listener_specs, event_handler) {
        let cleaner = null;

        if (listener_specs.listener_type === "timer") {
            const timeout = setTimeout(event_handler, listener_specs.delay);
            cleaner = () => clearTimeout(timeout)
        } else if (['click', 'mouseenter', 'mouseleave'].includes(listener_specs.listener_type)) {

            const target_element = listener_specs.target_selector === "" ? root_element : root_element.querySelector(listener_specs.target_selector);
            let event_handler_fixed = (event) => {
                if (event.type === 'click' || event.target === target_element) {
                    event.stopPropagation();
                    event_handler();
                }
            };

            // these will set pointer-events and cursor for nested elements
            target_element.classList.add('anima-listeners-active');

            if (listener_specs.listener_type === "click") {
                target_element.classList.add('anima-listeners-active-click');
            }

            target_element.addEventListener(listener_specs.listener_type, event_handler_fixed, true);
            cleaner = () => {
                target_element.removeEventListener(listener_specs.listener_type, event_handler_fixed, true);
                target_element.classList.remove('anima-listeners-active');
                target_element.classList.remove('anima-listeners-active-click');
            };
        }
        return cleaner;
    }

    function animate_elements(root_element, selector_to_properties_map, transition_props) {
        Object.entries(selector_to_properties_map).forEach(([selector, prop_values_map]) => {
            const element = selector === "" ? root_element : root_element.querySelector(selector);
            if (element) {

                const update_element_visibility = (visible) => {
                    if (visible) {
                        element.classList.toggle("anima-hidden", false)
                    } else {
                        element.classList.toggle("anima-hidden", true)
                    }
                };
                update_element_visibility(prop_values_map['opacity'] > 0 || getComputedStyle(element).opacity > 0.001 );

                // remove current animations, pausing elements in their current state
                anime.remove(element);
                let full_params = {
                    ...transition_props, // transition properties: easing, duration...
                    ...prop_values_map, // this element's animated properties: width? color? ...
                    targets: [element],
                    complete: () => update_element_visibility(getComputedStyle(element).opacity > 0.001)
                };


                // translate to anime js form
                if (prop_values_map.hasOwnProperty("transform")) {
                    const transform_val = full_params['transform'];
                    delete full_params['transform'];
                    transform_val.match(/\S*\([^)]*/g).map((x) => x.split('(')).forEach(([key, val]) => {
                            full_params[key] = val;
                        }
                    );
                }

                //match css easing curves
                if (full_params.hasOwnProperty("easing")) {
                    const mapping = {
                        // linear: 'linear',
                        "ease-in-out": "cubicBezier(0.42, 0, 0.58, 1)",
                        "ease-in": "cubicBezier(0.42, 0, 1, 1)",
                        "ease-out": "cubicBezier(0, 0, 0.58, 1)",
                    };
                    let ease = full_params["easing"].trim();
                    if (mapping.hasOwnProperty(ease)) {
                        ease = mapping[ease];
                    } else if (ease.startsWith('cubic-bezier')) {
                        ease = ease.replace('cubic-bezier', 'cubicBezier');
                    }
                    full_params["easing"] = ease;
                }

                // "width", "height",
                convert_to_matching_positioning(element, full_params);

                Object.keys(sides_opposites).forEach((side) => {
                    if (full_params.hasOwnProperty(side)) {
                        const value = full_params[side];
                        let {percent, pixel_offset} = normalize_to_percent_and_offset(value);
                        if (Math.abs(percent) < 0.001) {
                            full_params[side] = pixel_offset + 'px';
                        } else {
                            full_params[side] = percent + '%';
                            full_params['margin-' + side] = pixel_offset + 'px';
                        }
                        element.style[sides_opposites[side]] = 'auto';
                    }
                });
                containers.forEach((container) => {
                    if (full_params.hasOwnProperty(container)) {
                        const value = full_params[container];
                        let {percent, pixel_offset} = normalize_to_percent_and_offset(value);
                        if (Math.abs(percent) < 0.001) {
                            full_params[container] = pixel_offset + 'px';
                        } else {
                            if (Math.abs(pixel_offset) > 0) {
                                // convert pixels to additional percents
                                percent += to_relative_percent(element, container, pixel_offset);
                                percent = Math.max(0, percent);
                            }
                            full_params[container] = percent + '%';
                        }
                    }
                });

                anime(full_params); // anime js library globally available
            }
        })
    }

    function get_changed_properties_between_states(initial_element_state, from_state_element_state, to_state_element_state) {
        /**
         this function returns a mapping from elements affected by either states
         to their properties in 'to_state'
         e.g. {"#some_obj": {width: 100, height: 50}}
         values changed by 'from_state' are reverted to initial values
         **/
        let selector_to_props = {};

        // set all old state properties back to initial
        Object.entries(from_state_element_state).forEach(([selector, properties]) => {
            selector_to_props[selector] = selector_to_props[selector] || {};
            Object.entries(properties).forEach(([property, value]) => {
                selector_to_props[selector][property] = initial_element_state[selector][property];
            });
        });

        // override with new state properties
        Object.entries(to_state_element_state).forEach(([selector, properties]) => {
            selector_to_props[selector] = selector_to_props[selector] || {};
            Object.entries(properties).forEach(([property, value]) => {
                selector_to_props[selector][property] = value;
            });
        });

        return selector_to_props;
    }


    function transitioning_to_state(root_element, initial_properties, states_flow, now_state_name, transition_animation_time) {
        /**
         * called when a changing to a new state
         * registers listeners such as on_click, timers...
         * recursively calls itself and remove listeners when a listener is fired
         */
        const new_state_flow = states_flow[now_state_name];

        // set up new listeners
        let listener_cleanup_callbacks = [];

        for (const listener_specs of new_state_flow.listeners) {

            // this function is only called when the listener is fired
            function on_listener_run() {

                // remove all current listeners
                listener_cleanup_callbacks.forEach(callback => callback());
                listener_cleanup_callbacks = [];

                const next_state_name = listener_specs.change_to_state;


                const this_state_element_state = states_flow[now_state_name].overrides;
                const next_state_element_state = states_flow[next_state_name].overrides;

                // get all animated properties between the two states
                let element_selector_to_changed_properties = get_changed_properties_between_states(initial_properties, this_state_element_state, next_state_element_state);


                let longest_animation_time_ms = 0;

                Object.entries(listener_specs.animations).forEach(([selector, animation_specs]) => {
                    let filtered_props = {};
                    if (element_selector_to_changed_properties.hasOwnProperty(selector)) {
                        filtered_props[selector] = element_selector_to_changed_properties[selector];
                        longest_animation_time_ms = Math.max(longest_animation_time_ms, animation_specs.delay + animation_specs.duration);
                        animate_elements(root_element, filtered_props, animation_specs)
                    }
                });

                transitioning_to_state(root_element, initial_properties, states_flow, next_state_name, longest_animation_time_ms);
            }

            let final_listener_specs = {...listener_specs};
            if (listener_specs.listener_type === 'timer') {
                // timers should start ticking after animation is over
                final_listener_specs.delay += transition_animation_time;
            }
            const cleanup_callback = setup_listener(root_element, final_listener_specs, on_listener_run);
            listener_cleanup_callbacks.push(cleanup_callback);
        }
    }


    function run_when_doc_ready(fn) {

        // make sure anime js is loaded and available globally
        if (!document.getElementById('anime-js-script')) {
            let animejs_element = document.createElement('script');
            animejs_element.id = "anime-js-script";
            animejs_element.setAttribute('src', 'https://cdn.jsdelivr.net/npm/animejs@3.1.0/lib/anime.min.js');
            animejs_element.setAttribute('integrity', 'sha256-98Q574VkbV+PkxXCKSgL6jVq9mrVbS7uCdA+vt0sLS8=');
            animejs_element.setAttribute('crossorigin', 'anonymous');
            document.head.appendChild(animejs_element);
        }
        if (window.anime === undefined) {
            setTimeout(() => run_when_doc_ready(fn), 50);
            return;
        }

        // see if DOM is already available
        if (document.readyState === "complete" || document.readyState === "interactive") {
            // call on next available tick
            setTimeout(fn, 1);
        } else {
            document.addEventListener("DOMContentLoaded", fn);
        }
    }

    function load_initial_values(anima_components) {
        anima_components.forEach((anima_component) => {
            const root_element = document.querySelector(anima_component.root_element);
            const states_flow = anima_component.states_flow;
            const initial_state_name = anima_component.initial_state_name;
            // const initial_properties = anima_component.initial_properties;


            let initial_properties = {};
            Object.values(anima_component.states_flow).forEach((state_spec) => {
                Object.entries(state_spec.overrides).forEach(([selector, properties]) => {
                    initial_properties[selector] = initial_properties[selector] || {};
                    const element = selector === "" ? root_element : root_element.querySelector(selector);
                    Object.keys(properties).forEach((property) => {
                        initial_properties[selector][property] = element.style[property] ||
                            property === 'transform' && 'rotate(0deg)' ||
                            window.getComputedStyle(element)[property];
                    })
                });
            });
            // set properties to first state
            Object.entries(anima_component.states_flow[initial_state_name].overrides).forEach(([selector, properties]) => {
                const element = selector === "" ? root_element : root_element.querySelector(selector);
                animate_elements(element, {"": properties}, {duration: 0})
            });
            transitioning_to_state(root_element, initial_properties, states_flow, initial_state_name, 0);
        });
        document.querySelectorAll('.anima-not-ready').forEach((x) => x.classList.remove('anima-not-ready'));
    }

    run_when_doc_ready(() => load_initial_values(anima_components));

    // each of these describes a timeline 
    const anima_components = [
  {
    "initial_state_name": "state1", 
    "root_element": ".missouri-schwa", 
    "states_flow": {
      "state1": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path1": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path2": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path3": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path4": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path6": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state2", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path": {
            "opacity": "0.0"
          }, 
          ".path1": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path2": {
            "opacity": "0.0", 
            "transform": "rotate(9deg)"
          }, 
          ".path3": {
            "opacity": "0.0"
          }, 
          ".path4": {
            "opacity": "0.0"
          }, 
          ".path6": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.0"
          }
        }
      }, 
      "state10": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state11", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.45"
          }
        }
      }, 
      "state11": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state12", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.5"
          }
        }
      }, 
      "state12": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state13", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.55"
          }
        }
      }, 
      "state13": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state14", 
            "delay": 0, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.65"
          }
        }
      }, 
      "state14": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 0, 
                "easing": "cubic-bezier(0, 0, 0, 0)"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state15", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "height": "9px", 
            "left": "132px", 
            "opacity": "0.0", 
            "top": "279px", 
            "width": "10px"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.7"
          }
        }
      }, 
      "state15": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state16", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "height": "11px", 
            "left": "132px", 
            "top": "279px", 
            "width": "12px"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.75"
          }
        }
      }, 
      "state16": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 0, 
                "easing": "cubic-bezier(0.42, 0, 1, 1)"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state18", 
            "delay": 3, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.8"
          }
        }
      }, 
      "state17": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state19", 
            "listener_type": "mouseenter", 
            "target_selector": ".missouruh"
          }, 
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state19", 
            "delay": 2, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0", 
            "top": "calc(47.79% + 19px)"
          }, 
          ".missouruh": {
            "opacity": "0.0", 
            "top": "26.04%"
          }, 
          ".missouruhmask": {
            "height": "26px", 
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.9"
          }
        }
      }, 
      "state18": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 0, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state17", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.9"
          }
        }
      }, 
      "state19": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state20", 
            "listener_type": "mouseleave", 
            "target_selector": ".combinedshape"
          }
        ], 
        "overrides": {
          ".missouruhmask": {
            "height": "26px"
          }, 
          ".westhalf": {
            "opacity": "0.9"
          }
        }
      }, 
      "state2": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path1": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path2": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path3": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path4": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path6": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state3", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path1": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path2": {
            "opacity": "0.0", 
            "transform": "rotate(9deg)"
          }, 
          ".path3": {
            "opacity": "0.0"
          }, 
          ".path4": {
            "opacity": "0.0"
          }, 
          ".path6": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.05"
          }
        }
      }, 
      "state20": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 400, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state21", 
            "listener_type": "mouseenter", 
            "target_selector": ".combinedshape"
          }
        ], 
        "overrides": {
          ".missouree": {
            "top": "calc(47.79% + 21px)"
          }, 
          ".missouruh": {
            "top": "25.80%"
          }, 
          ".missouruhmask": {
            "height": "26px"
          }, 
          ".westhalf": {
            "opacity": "0.9"
          }
        }
      }, 
      "state21": {
        "listeners": [], 
        "overrides": {
          ".missouruhmask": {
            "height": "26px"
          }, 
          ".westhalf": {
            "opacity": "0.9"
          }
        }
      }, 
      "state3": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path2": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path3": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path4": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path6": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state4", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path2": {
            "opacity": "0.0", 
            "transform": "rotate(9deg)"
          }, 
          ".path3": {
            "opacity": "0.0"
          }, 
          ".path4": {
            "opacity": "0.0"
          }, 
          ".path6": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.1"
          }
        }
      }, 
      "state4": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path3": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path4": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path6": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state5", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path2": {
            "transform": "rotate(9deg)"
          }, 
          ".path3": {
            "opacity": "0.0"
          }, 
          ".path4": {
            "opacity": "0.0"
          }, 
          ".path6": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.15"
          }
        }
      }, 
      "state5": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path4": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path6": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state6", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path4": {
            "opacity": "0.0"
          }, 
          ".path6": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.2"
          }
        }
      }, 
      "state6": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path6": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state7", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path6": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.25"
          }
        }
      }, 
      "state7": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path7": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state8", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path7": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.3"
          }
        }
      }, 
      "state8": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path8": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state9", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path8": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.35"
          }
        }
      }, 
      "state9": {
        "listeners": [
          {
            "animations": {
              ".missouree": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruh": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".missouruhmask": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path10": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path11": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path12": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path16": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path17": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path18": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path19": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".path9": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".rectangle": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }, 
              ".westhalf": {
                "delay": 0, 
                "duration": 200, 
                "easing": "ease-in-out"
              }
            }, 
            "change_to_state": "state10", 
            "delay": 1, 
            "listener_type": "timer"
          }
        ], 
        "overrides": {
          ".missouree": {
            "opacity": "0.0"
          }, 
          ".missouruh": {
            "opacity": "0.0"
          }, 
          ".missouruhmask": {
            "opacity": "0.0"
          }, 
          ".path10": {
            "opacity": "0.0"
          }, 
          ".path11": {
            "opacity": "0.0"
          }, 
          ".path12": {
            "opacity": "0.0"
          }, 
          ".path16": {
            "opacity": "0.0"
          }, 
          ".path17": {
            "opacity": "0.0"
          }, 
          ".path18": {
            "opacity": "0.0"
          }, 
          ".path19": {
            "opacity": "0.0"
          }, 
          ".path9": {
            "opacity": "0.0"
          }, 
          ".rectangle": {
            "opacity": "0.0"
          }, 
          ".westhalf": {
            "opacity": "0.4"
          }
        }
      }
    }
  }
];
})();