var __slice = [].slice
var __push = [].push

function cadence () {
    var steps = __slice.call(arguments)

    function march (caller, steps, vargs, callback) {
        invoke.call(this, unfold(steps), 0, precede(caller, vargs), callback)
    }

    function execute () {
        var vargs = __slice.call(arguments, 0)
        var callback = function (error) { if (error) throw error }
        if (vargs.length) {
            callback = vargs.pop()
        }
        march.call(this, {}, steps, [async].concat(vargs), function (errors, finalizers) {
            var vargs = [null].concat(__slice.call(arguments, 2))
            finalize.call(this, finalizers, 0, errors, function (errors) {
                if (errors.length) {
                    callback(errors.uncaught || errors.shift())
                } else {
                    callback.apply(null, vargs)
                }
            })
        })
    }

    // To use the same `step` function throughout while supporting reentrancy,
    // we keep a stack of invocation objects. The stack is reversed; top is 0.
    // The `step` function is synchronous and will return immediately.
    //
    // It is possible for the user to invoke `step` outside of a step in a
    // cadence, we can't prevent it, nor really even detect it. Imagine the user
    // invoking `setTimeout` with a callback that calls `step` five minutes
    // later, long after the cadence has ended. Mayhem, but what can you do?

    //
    var invocations = []

    function async () { return createHandler.apply(null, arguments) }

    function unfold (steps) {
        var cadence = {
            errors: [],
            catchers: [],
            steps: [],
        // TODO: DOCUMENT: Only one finalizer after each step. You cannot have two
        // consecutive finalizers.
            finalizers: []
        }
        steps.forEach(function (step) {
            if (Array.isArray(step)) {
                if (step.length == 1) {
                    cadence.finalizers[cadence.steps.length] = { step: step[0] }
                } else {
                    cadence.steps.push(step[0])
                    cadence.catchers[cadence.steps.length - 1] = function (errors, error) {
                        var uncaught = []
                        errors.forEach(function (error) {
                            var caught = true
                            if (step.length == 4) {
                                caught = (typeof step[2] == 'string')
                                       ? error[step[1]] == step[2]
                                       : step[2].test(error[step[1]])
                            } else if (step.length == 3) {
                                var value = error.code || error.message
                                caught = (typeof step[1] == 'string')
                                       ? value == step[1]
                                       : step[1].test(value)
                            }
                            if (!caught && !errors.uncaught) errors.uncaught = error
                            return caught
                        })
                        if (!errors.uncaught) {
                            step[step.length - 1].call(this, errors, errors[0])
                        } else {
                            throw errors
                        }
                    }
                }
            } else if (typeof step == "function") {
                cadence.steps.push(step)
            } else {
                throw new Error("invalid arguments")
            }
        })
        return cadence
    }

    function createHandler () {
        var vargs = __slice.call(arguments)
        var i = -1

        // The caller as invoked the async function directly as an explicit early
        // return to exit the entire cadence.
        if (vargs[0] === null || vargs[0] instanceof Error) {
            vargs[0] = vargs[0] ? [ vargs[0] ] : []
            vargs.splice(1, 0, invocations[0].finalizers.splice(0, invocations[0].finalizers.length))
            invocations[0].count = Number.MAX_VALUE
            invocations[0].callback.apply(null, vargs)
            return
        }

        var callback = { errors: [], results: [] }
        if (callback.fixup = (vargs[0] === async)) {
            vargs.shift()
        }

        if (!isNaN(parseInt(vargs[0], 10))) {
            callback.arity = +(vargs.shift())
        }

        if (Array.isArray(vargs[0]) && vargs[0].length == 0) {
            callback.arrayed = !! vargs.shift()
        }

        invocations[0].callbacks.push(callback)

        unfold(vargs) // for the sake of error checking
        callback.steps = vargs

        if (callback.steps.length) {
            if (!callback.fixup) return createCadence(invocations[0], callback)
        }

        if (callback.arrayed) {
            if (this.event) return createCallback(invocations[0], callback, -1)
            else return createArray(invocations[0], callback)
        }

        return createCallback(invocations[0], callback, 0)
    }

    async.event = function () {
        var callback = createHandler.apply({ event: true }, arguments)
        return function () {
            return callback.apply(null, [ null ].concat(__slice.call(arguments)))
        }
    }

    async.error = function () {
        return createHandler.apply({ event: true }, [0, []].concat(__slice.call(arguments)))
    }

    async.jump = function (label) {
        var invocation = invocations[0]
        while (invocation.args) {
            for (var i = 0, I = invocation.args[0].steps.length; i < I; i++) {
                if (invocation.args[0].steps[i] === label) {
                    invocation.args[1] = i
                    return
                }
            }
            invocation = invocation.caller
        }
    }

    function createCadence (invocation, callback) {
        var index = 0

        if (!callback.arrayed) callback.starter = starter

        function starter () {
            var vargs = __slice.call(arguments)
            var count = 0
            var gather, counter
            var whilst, each

            if (callback.arrayed) {
                return createCallback(invocation, callback, index++).apply(null, [null].concat(vargs))
            } else if (callback.starter) {
                delete callback.starter

                if (vargs[0] == null) {
                    whilst = function () { return true }
                    vargs.shift()
                } else {
                    counter = vargs.pop()
                    if (each = Array.isArray(counter)) {
                        whilst = function () { return count++ != counter.length }
                    } else {
                        whilst = function () { return count++ != counter }
                    }
                    if (Array.isArray(vargs.shift())) gather = []
                }

                callback.steps.unshift(function () {
                    var vargs = __slice.call(arguments)
                    if (whilst()) {
                        async().apply(this, [null].concat(each ? [counter[count - 1]] : vargs))
                    } else if (gather) {
                        async.apply(this, [null].concat(vargs))
                        callback.results = gather
                    } else {
                        async.apply(this, [null].concat(vargs))
                    }
                })

                callback.steps.push(function () {
                    var vargs = __slice.call(arguments)
                    if (gather) gather.push(vargs)
                    async.jump(callback.steps[0])
                    async().apply(this, [null].concat(vargs))
                })

                createCallback(invocation, callback, 0).apply(null, [null].concat(vargs))
            }
        }

        return starter
    }

    function createArray (invocation, callback) {
        var index = 0
        return function () {
            var vargs = __slice.call(arguments)
            return createCallback(invocation, callback, index++)
        }
    }

    function createCallback (invocation, callback, index) {
        if (-1 < index) invocation.count++
        return function () {
            var vargs = __slice.call(arguments, 0), error
            error = vargs.shift()
            if (error) {
                invocation.errors.push(error)
            } else {
                if (index < 0) callback.results.push(vargs)
                else callback.results[index] = vargs
                if (callback.steps.length) {
                  invocation.count++
                  march.call(invocation.self, invocation, callback.steps, callback.results[index], function (errors, finalizers) {
                      callback.results[index] = __slice.call(arguments, 2) // TODO: use argue
                      __push.apply(invocation.errors, errors)

                      if (callback.fixup) {
                          __push.apply(invocation.finalizers, finalizers)
                          done()
                      } else {
                          finalize.call(this, finalizers, 0, invocation.errors, done)
                      }

                      function done () {
                          if (-1 < index && ++invocation.called == invocation.count) {
                              invoke.apply(invocation.self, invocation.args)
                          }
                      }
                  })
                }
                if (vargs[0] === invoke) {
                    invocation.callbacks.forEach(function (callback) {
                        if (callback.starter) {
                            // A reminder; zero index because the result is not arrayed.
                            createCallback(invocation, callback, 0).call(null)
                        }
                    })
                }
            }
            if (index < 0 ? invocation.errors.length : ++invocation.called == invocation.count) {
                invoke.apply(invocation.self, invocation.args)
            }
            callback.run = false
        }
    }

    function finalize (finalizers, index, errors, callback) {
        if (index == finalizers.length) {
            callback.call(this, errors)
        } else {
            var finalizer = finalizers[index]
            invoke.call(this, { steps: [ finalizer.step ], catchers: [], finalizers: [] }, 0, finalizer.previous, function (e) {
                __push.apply(errors, e)
                finalize.call(this, finalizers, index + 1, errors, callback)
            })
        }
    }

    function precede (caller, vargs) {
        return {
            caller: caller,
            callbacks: argue(vargs),
            errors: [],
            finalizers: []
        }
    }

    function argue (vargs) { return [{ results: [[invoke].concat(vargs)] }] }

    function invoke (cadence, index, previous, callback) {
        var callbacks = previous.callbacks
        var catcher, finalizers
        var cb, arity, vargs = [], arg = 0, i
        var step, result, hold

        if (previous.errors.length) {
            catcher = cadence.catchers[index - 1]
            if (catcher) {
                march.call(previous.self, previous, [ catcher ], [ previous.errors, previous.errors[0] ], function (errors, finalizers) {
                  previous.errors = []
                  __push.apply(previous.finalizers, finalizers)
                  if (errors.length) {
                      arguments[1] = previous.finalizers
                      callback.apply(this, __slice.call(arguments))
                  } else {
                      previous.__args = __slice.call(arguments, 2)
                      previous.callback = argue(__slice.call(arguments, 2))
                      invoke.call(previous.self, cadence, index, previous, callback)
                  }
                })
            } else {
                callback.call(this, previous.errors, previous.finalizers.splice(0, previous.finalizers.length))
            }
            return
        }

        if (callbacks.length == 1) {
            callbacks[0].results[0].shift()
            if (!callbacks[0].results[0].length) {
                callbacks.shift()
            }
        } else {
            callbacks.shift()
        }

        while (callbacks.length) {
            cb = callbacks.shift()
            if (cb.arrayed) {
                cb.results = cb.results.filter(function (vargs) { return vargs.length })
            }
            if ('arity' in cb) {
                arity = cb.arity
            } else {
                arity = cb.arrayed ? 1 : 0
                cb.results.forEach(function (result) {
                    arity = Math.max(arity, result.length)
                })
            }
            for (i = 0; i < arity; i++) {
                vargs.push({
                    values: [],
                    arrayed: ('arrayed' in cb) ? cb.arrayed : cb.results.length > 1
                })
            }
            cb.results.forEach(function (result) {
                for (var i = 0; i < arity; i++) {
                    vargs[arg + i].values.push(result[i])
                }
            })
            arg += arity
        }

        vargs = vargs.map(function (vargs) {
            return vargs.arrayed ? vargs.values : vargs.values.shift()
        })

        if (cadence.finalizers[index]) {
            previous.finalizers.push(cadence.finalizers[index])
            cadence.finalizers[index].previous = previous
            cadence.finalizers[index].previous.callbacks = argue(vargs)
        }

        if (cadence.steps.length == index) {
            var finalizers = previous.finalizers.splice(0, previous.finalizers.length)
            callback.apply(this, [ [], finalizers ].concat(vargs))
            return
        }

        invocations.unshift({
            self: this,
            callbacks: [],
            count: 0,
            called: 0,
            errors: [],
            finalizers: previous.finalizers,
            //index: index,
            callback: callback,
            caller: previous.caller
        })
        invocations[0].args = [ cadence, index + 1, invocations[0], callback ]

        hold = async()
        try {
            result = cadence.steps[index].apply(this, vargs)
        } catch (errors) {
            if (errors === previous.caller.errors) {
                invocations[0].errors.uncaught = errors.uncaught
            } else {
                errors = [ errors ]
            }
            __push.apply(invocations[0].errors, errors)
            invocations[0].called = invocations[0].count - 1
        }
        invocations.shift()
        hold.apply(this, [ null, invoke ].concat(result === void(0) ? [] : [ result ]))
    }

    return execute
}

module.exports = cadence
